const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'balgram'
};
const pool = mysql.createPool(dbConfig);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'YOUR_NGO_EMAIL@gmail.com',
    pass: 'YOUR_EMAIL_APP_PASSWORD'
  }
});

const JWT_SECRET = "9f4d8e2b7a1c5f3d6e8b9a2c4d7f1e0b6a3c9d8e7f1b2a4c6d8e9f0a1b3c5d7e";

// ---------- SIGNUP ----------
app.post('/api/signup', async (req, res) => {
  const { fullname, email, password } = req.body;
  if (!fullname || !email || !password) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.execute(
      "INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)",
      [fullname, email, hashedPassword]
    );
    res.status(201).json({ success: true, message: "User registered successfully." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ success: false, message: "Email already registered." });
    }
    console.error("Signup error:", error);
    res.status(500).json({ success: false, message: "Server error during signup." });
  }
});

// ---------- LOGIN ----------
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required." });
  }
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid email or password." });
    }
    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Invalid email or password." });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
    res.status(200).json({ success: true, message: "Login successful.", token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
});

// ---------- JWT Middleware ----------
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token provided." });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token." });
    req.user = user;
    next();
  });
}

// ---------- CONTACT FORM ----------
app.post('/contact', async (req, res) => {
  const { name, email, website, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Please fill out all required fields.' });
  }
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      website VARCHAR(255),
      message TEXT NOT NULL,
      submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;
  try {
    await pool.execute(createTableQuery);
    await pool.execute(
      'INSERT INTO contact_messages (full_name, email, website, message) VALUES (?, ?, ?, ?)',
      [name, email, website, message]
    );
    const mailOptions = {
      from: 'YOUR_NGO_EMAIL@gmail.com',
      to: 'YOUR_NGO_EMAIL@gmail.com',
      subject: `New Contact Form Submission from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nWebsite: ${website || 'N/A'}\nMessage:\n${message}`
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) console.error('Email sending error:', error);
      else console.log('Email sent:', info.response);
    });
    res.status(200).json({ success: true, message: 'Thank you for your message! We will get back to you shortly.' });
  } catch (error) {
    console.error('Database or server error:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred. Please try again.' });
  }
});

// ---------- NEWS ----------
app.get('/api/news', async (req, res) => {
  try {
    const [news] = await pool.query('SELECT * FROM news ORDER BY created_at DESC');
    res.status(200).json(news);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch news articles.' });
  }
});

app.post('/api/news', async (req, res) => {
  const { title, content, image_path } = req.body;
  if (!title || !content || !image_path) {
    return res.status(400).json({ success: false, message: 'Missing news article information.' });
  }
  try {
    await pool.execute(
      'INSERT INTO news (title, content, image_path) VALUES (?, ?, ?)',
      [title, content, image_path]
    );
    res.status(201).json({ success: true, message: 'News article added successfully.' });
  } catch (error) {
    console.error('Error adding news article:', error);
    res.status(500).json({ success: false, message: 'Failed to add news article.' });
  }
});

// ---------- CAUSES ----------
app.get('/api/causes', async (req, res) => {
  try {
    const [causes] = await pool.query('SELECT * FROM causes ORDER BY created_at DESC');
    res.status(200).json(causes);
  } catch (error) {
    console.error('Error fetching causes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch causes.' });
  }
});

app.post('/api/causes', async (req, res) => {
  const { title, image_path, location, tags, funding_goal } = req.body;
  if (!title || !image_path || !funding_goal) {
    return res.status(400).json({ success: false, message: 'Missing required cause information.' });
  }
  try {
    await pool.execute(
      'INSERT INTO causes (title, image_path, location, tags, funding_goal) VALUES (?, ?, ?, ?, ?)',
      [title, image_path, location, tags, funding_goal]
    );
    res.status(201).json({ success: true, message: 'Cause added successfully.' });
  } catch (error) {
    console.error('Error adding cause:', error);
    res.status(500).json({ success: false, message: 'Failed to add cause.' });
  }
});

// ---------- DONATIONS ----------

// General donation
app.post('/api/donate', async (req, res) => {
  const { donor_name, donor_email, donation_amount, message } = req.body;
  if (!donor_name || !donor_email || !donation_amount || donation_amount <= 0) {
    return res.status(400).json({ success: false, message: 'Missing or invalid donation information.' });
  }
  try {
    await pool.execute(
      `INSERT INTO donations (donor_name, donor_email, donation_amount, message, cause_id) 
       VALUES (?, ?, ?, ?, NULL)`,
      [donor_name, donor_email, donation_amount, message || null]
    );
    res.status(200).json({ success: true, message: 'General donation recorded successfully.' });
  } catch (error) {
    console.error('Error processing general donation:', error);
    res.status(500).json({ success: false, message: 'Failed to record donation.' });
  }
});

// Cause-specific donation
app.post('/api/causes/:id/donate', async (req, res) => {
  const { id } = req.params;
  const { donor_name, donor_email, donation_amount, message } = req.body;
  if (!donor_name || !donor_email || !donation_amount || donation_amount <= 0) {
    return res.status(400).json({ success: false, message: 'Missing or invalid donation information.' });
  }
  try {
    await pool.execute(
      `INSERT INTO donations (donor_name, donor_email, donation_amount, message, cause_id) 
       VALUES (?, ?, ?, ?, ?)`,
      [donor_name, donor_email, donation_amount, message || null, id]
    );
    await pool.execute(
      'UPDATE causes SET amount_raised = amount_raised + ? WHERE id = ?',
      [donation_amount, id]
    );
    res.status(200).json({ success: true, message: 'Donation recorded and applied to cause.' });
  } catch (error) {
    console.error('Error processing cause donation:', error);
    res.status(500).json({ success: false, message: 'Failed to record donation.' });
  }
});

// ---------- START ----------
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
