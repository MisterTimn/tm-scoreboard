require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // Add SPREADSHEET_ID to .env as well
const SHEET_NAME = process.env.SHEET_NAME; // Add SHEET_NAME to .env as well

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '')));

// Endpoint to fetch Google Sheet data
app.get('/api/sheet-data', async (req, res) => {
    if (!GOOGLE_SHEETS_API_KEY || !SPREADSHEET_ID || !SHEET_NAME) {
        return res.status(500).json({ error: 'API key, Spreadsheet ID, or Sheet Name not configured on the server.' });
    }

    const range = encodeURIComponent(SHEET_NAME);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${GOOGLE_SHEETS_API_KEY}`;

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching Google Sheet data:', error.message);
        if (error.response) {
            console.error('Error details:', error.response.data);
            return res.status(error.response.status).json({ error: 'Failed to fetch data from Google Sheets.', details: error.response.data });
        }
        return res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
});

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
