const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection details
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'ngo_website'
};

const pool = mysql.createPool(dbConfig);

// Nodemailer transporter (ensure you replace with your actual details)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'YOUR_NGO_EMAIL@gmail.com',
        pass: 'YOUR_EMAIL_APP_PASSWORD'
    }
});

// Endpoint for handling donations
app.post('/donate', async (req, res) => {
    // We now expect 'cause_id' to be sent from the front-end donation form.
    const { donor_name, donor_email, donation_amount, message, cause_id } = req.body;

    if (!donor_name || !donor_email || !donation_amount || donation_amount <= 0 || !cause_id) {
        return res.status(400).json({ success: false, message: 'Missing required donation information.' });
    }

    try {
        // We will perform two operations inside a transaction to ensure data consistency.
        // If either query fails, both will be rolled back.
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Step 1: Insert the donation into the 'donations' table.
            await connection.execute(
                'INSERT INTO donations (donor_name, donor_email, donation_amount, message, cause_id) VALUES (?, ?, ?, ?, ?)',
                [donor_name, donor_email, donation_amount, message, cause_id]
            );

            // Step 2: Update the 'causes' table by incrementing the 'amount_raised' for the specific cause.
            await connection.execute(
                'UPDATE causes SET amount_raised = amount_raised + ? WHERE id = ?',
                [donation_amount, cause_id]
            );

            // If both queries succeed, commit the transaction.
            await connection.commit();
            res.status(200).json({ success: true, message: 'Thank you for your generous donation! We will contact you soon for payment details.' });

        } catch (error) {
            // If any error occurs, roll back the changes.
            await connection.rollback();
            throw error; // Re-throw the error to be caught by the outer catch block.
        } finally {
            // Release the connection back to the pool.
            connection.release();
        }

    } catch (error) {
        console.error('Database or server error:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred. Please try again.' });
    }
});

// Endpoint for handling contact form submissions
app.post('/contact', async (req, res) => {
    const { name, email, website, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'Please fill out all required fields.' });
    }

    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INT(11) AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            website VARCHAR(255),
            message TEXT NOT NULL,
            submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

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
            if (error) {
                console.error('Email sending error:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        res.status(200).json({ success: true, message: 'Thank you for your message! We will get back to you shortly.' });

    } catch (error) {
        console.error('Database or server error:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred. Please try again.' });
    }
});

// Endpoint to get all news articles for the front end
app.get('/api/news', async (req, res) => {
    try {
        const [news] = await pool.query('SELECT * FROM news ORDER BY published_at DESC');
        res.status(200).json(news);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch news articles.' });
    }
});

// Endpoint to add a new news article (simple admin endpoint)
app.post('/api/news', async (req, res) => {
    const { title, content, image_path } = req.body;
    
    // Basic validation
    if (!title || !content || !image_path) {
        return res.status(400).json({ success: false, message: 'Missing news article information.' });
    }
    
    try {
        await pool.execute('INSERT INTO news (title, content, image_path) VALUES (?, ?, ?)', [title, content, image_path]);
        res.status(201).json({ success: true, message: 'News article added successfully.' });
    } catch (error) {
        console.error('Error adding news article:', error);
        res.status(500).json({ success: false, message: 'Failed to add news article.' });
    }
});

// Endpoint to get all causes for the front end
app.get('/api/causes', async (req, res) => {
    try {
        const [causes] = await pool.query('SELECT * FROM causes ORDER BY created_at DESC');
        res.status(200).json(causes);
    } catch (error) {
        console.error('Error fetching causes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch causes.' });
    }
});

// Endpoint to add a new cause (simple admin endpoint)
app.post('/api/causes', async (req, res) => {
    const { title, image_path, location, tags, funding_goal } = req.body;
    
    // Basic validation
    if (!title || !image_path || !funding_goal) {
        return res.status(400).json({ success: false, message: 'Missing required cause information.' });
    }
    
    try {
        await pool.execute('INSERT INTO causes (title, image_path, location, tags, funding_goal) VALUES (?, ?, ?, ?, ?)', [title, image_path, location, tags, funding_goal]);
        res.status(201).json({ success: true, message: 'Cause added successfully.' });
    } catch (error) {
        console.error('Error adding cause:', error);
        res.status(500).json({ success: false, message: 'Failed to add cause.' });
    }
});

// Endpoint to update a cause's donation amount (not used by front-end, but kept as an example)
app.post('/api/causes/:id/donate', async (req, res) => {
    const { id } = req.params;
    const { donation_amount } = req.body;

    if (!donation_amount || donation_amount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid donation amount.' });
    }

    try {
        await pool.execute(
            'UPDATE causes SET amount_raised = amount_raised + ? WHERE id = ?',
            [donation_amount, id]
        );
        res.status(200).json({ success: true, message: 'Donation successfully applied to cause.' });
    } catch (error) {
        console.error('Error updating cause donation:', error);
        res.status(500).json({ success: false, message: 'Failed to update cause donation.' });
    }
});







// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});