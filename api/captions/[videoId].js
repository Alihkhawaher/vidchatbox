const { getSubtitles } = require('youtube-captions-scraper');

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

    // Get videoId from the URL path parameter
    const videoId = req.url.split('/').pop().split('?')[0];
    const lang = req.query.lang || 'en';
    const allowAuto = req.query.auto === 'true';
    const includeTimestamps = req.query.timestamps === 'true';
    
    if (!videoId) {
        return res.status(400).json({
            error: 'Missing video ID',
            timestamp: new Date().toISOString()
        });
    }

    console.log(`Fetching captions for video ID: ${videoId}`);
    console.log(`Language: ${lang}, Allow Auto-generated: ${allowAuto}, Include Timestamps: ${includeTimestamps}`);

    try {
        // Try to get manual captions first
        try {
            console.log('Attempting to fetch manual captions...');
            const captions = await getSubtitles({
                videoID: videoId,
                lang: lang
            });

            if (captions && captions.length > 0) {
                const fullText = captions
                    .map(caption => {
                        if (includeTimestamps) {
                            const startTime = Math.floor(caption.start);
                            const hours = Math.floor(startTime / 3600);
                            const minutes = Math.floor((startTime % 3600) / 60);
                            const seconds = startTime % 60;
                            const timestamp = `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
                            return `${timestamp} ${caption.text}`;
                        }
                        return caption.text;
                    })
                    .join('\n')
                    .trim();

                console.log(`Successfully fetched manual captions. Length: ${fullText.length} characters`);
                return res.status(200).send(fullText);
            } else {
                console.log('No manual captions found in response');
            }
        } catch (error) {
            console.log('Error fetching manual captions:', error.message);
            if (error.message.includes('Could not find the language')) {
                console.log(`Language '${lang}' not available for manual captions`);
            }
        }

        // If manual captions aren't available and auto-generated are allowed, try those
        if (allowAuto) {
            try {
                console.log(`Attempting to fetch auto-generated captions for language: ${lang}`);
                const autoCaptions = await getSubtitles({
                    videoID: videoId,
                    lang: lang,
                    auto: true
                });

                if (autoCaptions && autoCaptions.length > 0) {
                    const fullText = autoCaptions
                        .map(caption => {
                            if (includeTimestamps) {
                                const startTime = Math.floor(caption.start);
                                const hours = Math.floor(startTime / 3600);
                                const minutes = Math.floor((startTime % 3600) / 60);
                                const seconds = startTime % 60;
                                const timestamp = `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
                                return `${timestamp} ${caption.text}`;
                            }
                            return caption.text;
                        })
                        .join('\n')
                        .trim();

                    console.log(`Successfully fetched auto-generated captions. Length: ${fullText.length} characters`);
                    return res.status(200).send(fullText);
                } else {
                    console.log('No auto-generated captions found in response');
                }
            } catch (error) {
                console.log('Error fetching auto-generated captions:', error.message);
                if (error.message.includes('Could not find the language')) {
                    console.log(`Language '${lang}' not available for auto-generated captions`);
                }
            }
        }

        // If we get here, no captions were found
        const errorMessage = `No ${allowAuto ? 'manual or auto-generated' : 'manual'} captions found for language: ${lang}`;
        console.log(errorMessage);
        throw new Error(errorMessage);

    } catch (error) {
        console.error('Error processing request:', error);
        
        // Determine if this is a language-specific error
        const isLanguageError = error.message.includes('Could not find the language') || 
                              error.message.includes('Language not available');
        
        return res.status(404).json({
            error: 'Captions not found',
            videoId,
            language: lang,
            autoGenerated: allowAuto,
            details: isLanguageError ? 
                `Language '${lang}' is not available for this video. Try another language or enable auto-generated captions.` :
                error.message,
            timestamp: new Date().toISOString()
        });
    }
};
