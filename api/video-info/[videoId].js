const { getVideoInfo } = require('../../video_info.js');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get videoId from the URL path parameter
        const videoId = req.url.split('/').pop().split('?')[0];
        
        if (!videoId) {
            return res.status(400).json({
                error: 'Missing video ID',
                timestamp: new Date().toISOString()
            });
        }

        console.log(`Fetching video info for video ID: ${videoId}`);
        const videoInfo = await getVideoInfo(videoId);
        
        if (!videoInfo) {
            throw new Error('Failed to fetch video info');
        }

        return res.status(200).json(videoInfo);
    } catch (error) {
        console.error('Error fetching video info:', error);
        
        // Determine appropriate status code based on error
        const statusCode = error.message.includes('API key') ? 500 : 
                         error.message.includes('not found') ? 404 : 
                         error.response?.status || 500;
        
        return res.status(statusCode).json({
            error: 'Video info not found',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
