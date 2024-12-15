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

    const { videoId } = req.query;
    
    try {
        console.log(`Fetching video info for video ID: ${videoId}`);
        const videoInfo = await getVideoInfo(videoId);
        
        if (!videoInfo) {
            throw new Error('Failed to fetch video info');
        }

        return res.status(200).json(videoInfo);
    } catch (error) {
        console.error('Error fetching video info:', error);
        
        return res.status(404).json({
            error: 'Video info not found',
            videoId,
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
