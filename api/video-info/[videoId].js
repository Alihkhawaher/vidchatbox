const { getVideoInfo } = require('../../video_info.js');
const config = require('../../config');

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
        // Log configuration state
        console.log('Configuration check:', {
            hasConfig: !!config,
            hasYoutubeConfig: !!config.youtube,
            hasApiKey: !!config.youtube.apiKey,
            apiKeyPrefix: config.youtube.apiKey ? config.youtube.apiKey.substring(0, 8) + '...' : 'not set'
        });

        // Log environment variables
        console.log('Environment variables check:', {
            hasYoutubeKey: !!process.env.YOUTUBE_API_KEY,
            hasGoogleKey: !!process.env.GOOGLE_API_KEY,
            youtubeKeyPrefix: process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.substring(0, 8) + '...' : 'not set',
            googleKeyPrefix: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.substring(0, 8) + '...' : 'not set'
        });

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
        console.error('Error in video-info API:', error);
        
        // Determine appropriate status code and error message
        let statusCode = 500;
        let errorMessage = error.message;

        if (error.message.includes('API key')) {
            statusCode = 500;
            errorMessage = 'Server configuration error: YouTube API key is not configured';
        } else if (error.message.includes('not found')) {
            statusCode = 404;
            errorMessage = 'Video not found';
        } else if (error.response?.status) {
            statusCode = error.response.status;
        }
        
        return res.status(statusCode).json({
            error: 'Video info not found',
            details: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
};
