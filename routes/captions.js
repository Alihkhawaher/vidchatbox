const express = require('express');
const router = express.Router();
const { getSubtitles } = require('youtube-captions-scraper');

router.get('/fetch', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        // Extract video ID from URL
        const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        console.log(`${new Date().toISOString()} - Fetching captions for video ID: ${videoId}`);

        // Try to get manual captions first
        try {
            const captions = await getSubtitles({
                videoID: videoId,
                lang: 'en'
            });

            if (captions && captions.length > 0) {
                const fullText = captions
                    .map(caption => {
                        const startTime = Math.floor(caption.start);
                        const hours = Math.floor(startTime / 3600);
                        const minutes = Math.floor((startTime % 3600) / 60);
                        const seconds = startTime % 60;
                        const timestamp = `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
                        return `${timestamp} ${caption.text}`;
                    })
                    .join('\n')
                    .trim();

                console.log(`Successfully fetched manual captions. Length: ${fullText.length} characters`);
                return res.json({
                    captions: {
                        playerCaptionsTracklistRenderer: {
                            captionTracks: [{
                                languageCode: 'en',
                                name: { simpleText: 'English' },
                                baseUrl: fullText
                            }]
                        }
                    }
                });
            }
        } catch (error) {
            console.log('Manual captions not found:', error.message);
        }

        // If manual captions aren't available, try auto-generated
        try {
            console.log('Attempting to fetch auto-generated captions...');
            const autoCaptions = await getSubtitles({
                videoID: videoId,
                lang: 'en',
                auto: true
            });

            if (autoCaptions && autoCaptions.length > 0) {
                const fullText = autoCaptions
                    .map(caption => {
                        const startTime = Math.floor(caption.start);
                        const hours = Math.floor(startTime / 3600);
                        const minutes = Math.floor((startTime % 3600) / 60);
                        const seconds = startTime % 60;
                        const timestamp = `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
                        return `${timestamp} ${caption.text}`;
                    })
                    .join('\n')
                    .trim();

                console.log(`Successfully fetched auto-generated captions. Length: ${fullText.length} characters`);
                return res.json({
                    captions: {
                        playerCaptionsTracklistRenderer: {
                            captionTracks: [{
                                languageCode: 'en',
                                name: { simpleText: 'English (auto-generated)' },
                                baseUrl: fullText
                            }]
                        }
                    }
                });
            }
        } catch (error) {
            console.log('Auto-generated captions not found:', error.message);
        }

        // If we get here, no captions were found
        throw new Error('No manual or auto-generated captions found');

    } catch (error) {
        console.error('Error fetching captions:', error);
        res.status(404).json({ 
            error: 'Captions not found',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
