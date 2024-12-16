const axios = require('axios');

const BASE_URL = 'https://www.googleapis.com/youtube/v3';
const API_KEY = process.env.YOUTUBE_API_KEY;

async function getVideoInfo(videoId) {
    if (!API_KEY) {
        console.error('YouTube API key not found in environment variables');
        throw new Error('YouTube API key is not configured');
    }

    try {
        console.log('Making request with API key:', API_KEY.substring(0, 8) + '...');
        
        const response = await axios.get(`${BASE_URL}/videos`, {
            params: {
                part: 'snippet,statistics,contentDetails',
                id: videoId,
                key: API_KEY
            }
        });

        if (!response.data.items || response.data.items.length === 0) {
            throw new Error('Video not found');
        }

        const video = response.data.items[0];
        const { snippet, statistics, contentDetails } = video;

        // Convert ISO 8601 duration to seconds
        const duration = contentDetails.duration;
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        const hours = (match[1] ? parseInt(match[1]) : 0);
        const minutes = (match[2] ? parseInt(match[2]) : 0);
        const seconds = (match[3] ? parseInt(match[3]) : 0);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

        // Format duration for display
        const formattedDuration = `${hours ? hours + ':' : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const metadata = {
            title: snippet.title,
            description: snippet.description,
            author: snippet.channelTitle,
            viewCount: statistics.viewCount,
            uploadDate: new Date(snippet.publishedAt).toLocaleDateString(),
            likes: statistics.likeCount,
            duration: totalSeconds,
            formattedDuration,
            tags: snippet.tags || [],
            category: snippet.categoryId
        };

        // Format the metadata into a readable message
        const message = `
Video Information:
=================
Title: ${metadata.title}
Author: ${metadata.author}
Upload Date: ${metadata.uploadDate}
Duration: ${formattedDuration}
Views: ${parseInt(metadata.viewCount).toLocaleString()}
${metadata.likes ? `Likes: ${parseInt(metadata.likes).toLocaleString()}` : ''}
${metadata.tags?.length ? `Tags: ${metadata.tags.join(', ')}` : ''}

Description:
${metadata.description}
=================
`;

        return {
            metadata,
            formattedMessage: message
        };
    } catch (error) {
        console.error('Error fetching video info:', error.message);
        if (error.response?.data?.error?.message) {
            throw new Error(`YouTube API error: ${error.response.data.error.message}`);
        }
        throw error;
    }
}

module.exports = {
    getVideoInfo
};
