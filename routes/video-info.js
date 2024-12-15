const express = require('express');
const router = express.Router();
const axios = require('axios');

const API_KEY = 'AIzaSyB5KOBmVMoUcQCwnXkIq5c57pUAn1gPLNc';
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

router.get('/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    
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
            viewCount: parseInt(statistics.viewCount).toLocaleString(),
            uploadDate: new Date(snippet.publishedAt).toLocaleDateString(),
            likes: statistics.likeCount ? parseInt(statistics.likeCount).toLocaleString() : null,
            duration: formattedDuration,
            tags: snippet.tags || []
        };

        // Format the metadata into a message
        const message = `
Video Information:
=================
Title: ${metadata.title}
Author: ${metadata.author}
Upload Date: ${metadata.uploadDate}
Duration: ${metadata.duration}
Views: ${metadata.viewCount}
${metadata.likes ? `Likes: ${metadata.likes}` : ''}
${metadata.tags?.length ? `Tags: ${metadata.tags.join(', ')}` : ''}

Description:
${metadata.description}
=================
`;

        res.json({
            metadata,
            formattedMessage: message
        });

    } catch (error) {
        console.error('Error fetching video info:', error.message);
        res.status(404).json({
            error: 'Video info not found',
            details: error.message
        });
    }
});

module.exports = router;
