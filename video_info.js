const axios = require('axios');

const API_KEY = 'AIzaSyB5KOBmVMoUcQCwnXkIq5c57pUAn1gPLNc';
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

async function getVideoInfo(videoId) {
    try {
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
        throw error;
    }
}

module.exports = {
    getVideoInfo
};
