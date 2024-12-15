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
        // Since we're using serverless functions, we don't maintain state between requests
        // So this endpoint just needs to return success
        return res.status(200).json({
            message: 'Chat history cleared',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error clearing chat:', error);
        return res.status(500).json({
            error: 'Failed to clear chat history',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
