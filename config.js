// Load environment variables
require('dotenv').config();

const config = {
    youtube: {
        apiKey: process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY,
        baseUrl: 'https://www.googleapis.com/youtube/v3'
    }
};

// Validate required configuration
function validateConfig() {
    if (!config.youtube.apiKey) {
        console.error('Missing YouTube API key in environment variables');
        throw new Error('YouTube API key is not configured');
    }
    return config;
}

module.exports = validateConfig();
