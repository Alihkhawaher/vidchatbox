const express = require('express');
const router = express.Router();
const chatRouter = require('../../routes/chat');

// Create a new express app instance for the API route
const app = express();
app.use(express.json());

// Handle POST /api/chat/clear
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        try {
            // Reset any chat state/history here
            res.status(200).json({ message: 'Chat history cleared' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to clear chat history' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};
