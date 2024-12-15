const express = require('express');
const router = express.Router();
const chatRouter = require('../../routes/chat');

// Create a new express app instance for the API route
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/chat', chatRouter);

// Handle both POST /api/chat and POST /api/chat/clear
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        if (req.url === '/api/chat/clear') {
            // Handle clear endpoint
            return app._router.handle(req, res);
        } else {
            // Handle main chat endpoint
            return app(req, res);
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};
