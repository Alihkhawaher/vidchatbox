const { handleChatMessage } = require('../../routes/chat.js');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message, captions, provider } = req.body;

        if (!message || !captions) {
            return res.status(400).json({
                error: 'Missing required parameters',
                timestamp: new Date().toISOString()
            });
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Process the chat message and stream the response
        await handleChatMessage(message, captions, provider, (chunk) => {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        });

        res.end();
    } catch (error) {
        console.error('Error in chat processing:', error);
        
        // If headers haven't been sent yet, send error as JSON
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'Chat processing failed',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
        
        // If headers have been sent (streaming started), send error as SSE
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
        })}\n\n`);
        res.end();
    }
};
