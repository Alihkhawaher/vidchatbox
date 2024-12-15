const { getVideoInfo } = require('./video_info');
const { getSubtitles } = require('youtube-captions-scraper');

async function getFullVideoContent(videoId) {
    try {
        // First get video metadata
        const { formattedMessage } = await getVideoInfo(videoId);
        console.log(formattedMessage);

        // Then get captions
        const captions = await getSubtitles({
            videoID: videoId,
            lang: 'ar',
            auto: true
        });

        if (captions && captions.length > 0) {
            const captionsText = captions
                .map(caption => {
                    const startTime = Math.floor(caption.start);
                    const hours = Math.floor(startTime / 3600);
                    const minutes = Math.floor((startTime % 3600) / 60);
                    const seconds = startTime % 60;
                    const timestamp = `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
                    return `${timestamp} ${caption.text}`;
                })
                .join('\n');
            
            console.log('\nVideo Captions:');
            console.log('================');
            console.log(captionsText);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Test with a video ID
const videoId = 'H1u5rgxsKeU'; // Using the same video ID from get-captions.js
getFullVideoContent(videoId);
