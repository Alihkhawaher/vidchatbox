const axios = require('axios');
const { getSubtitles } = require('youtube-captions-scraper');

async function fetchCaptionsWithFallback(videoId, lang, auto = false) {
    // First try with youtube-captions-scraper
    try {
        console.log(`Attempting to fetch captions with youtube-captions-scraper for ${lang}${auto ? ' (auto)' : ''}`);
        const captions = await getSubtitles({
            videoID: videoId,
            lang: lang,
            auto: auto
        });

        if (captions && captions.length > 0) {
            console.log('Successfully fetched captions with youtube-captions-scraper');
            return captions;
        }
    } catch (error) {
        console.log(`youtube-captions-scraper failed: ${error.message}`);
    }

    // Fallback to direct API request with multiple language format attempts
    const languageVariants = [
        lang,                    // Original language code
        lang.split('-')[0],      // Base language code (e.g., 'en' from 'en-US')
        `${lang}_${lang}`,       // Format some YouTube videos use (e.g., 'ar_ar')
        lang.toLowerCase(),      // Lowercase version
        lang.toUpperCase()       // Uppercase version
    ];

    for (const langVariant of languageVariants) {
        try {
            console.log(`Attempting fallback caption fetch for language variant: ${langVariant}`);
            
            // Try both XML and JSON endpoints
            const endpoints = [
                `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langVariant}${auto ? '&kind=asr' : ''}`,
                `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langVariant}${auto ? '&kind=asr' : ''}&fmt=json3`
            ];

            for (const endpoint of endpoints) {
                try {
                    console.log(`Trying endpoint: ${endpoint}`);
                    const response = await axios.get(endpoint);
                    
                    if (response.data) {
                        if (endpoint.includes('fmt=json3')) {
                            // Handle JSON format
                            if (response.data.events) {
                                return response.data.events.map(event => ({
                                    start: event.tStartMs / 1000,
                                    dur: (event.dDurationMs || 0) / 1000,
                                    text: event.segs ? event.segs.map(seg => seg.utf8).join(' ') : ''
                                })).filter(caption => caption.text.trim());
                            }
                        } else {
                            // Handle XML format
                            const text = response.data;
                            if (text.includes('<transcript>')) {
                                const entries = text.match(/<text[^>]*>(.*?)<\/text>/g) || [];
                                const parsedEntries = entries.map(entry => {
                                    const startMatch = entry.match(/start="([\d.]+)"/);
                                    const durMatch = entry.match(/dur="([\d.]+)"/);
                                    const textMatch = entry.match(/<text[^>]*>(.*?)<\/text>/);
                                    
                                    if (startMatch && durMatch && textMatch) {
                                        const start = parseFloat(startMatch[1]);
                                        const duration = parseFloat(durMatch[1]);
                                        const text = textMatch[1]
                                            .replace(/&amp;/g, '&')
                                            .replace(/&lt;/g, '<')
                                            .replace(/&gt;/g, '>')
                                            .replace(/&quot;/g, '"')
                                            .replace(/&#39;/g, "'")
                                            .trim();
                                        
                                        return {
                                            start,
                                            dur: duration,
                                            text
                                        };
                                    }
                                    return null;
                                }).filter(Boolean);

                                if (parsedEntries.length > 0) {
                                    console.log(`Successfully fetched captions with fallback method (${parsedEntries.length} entries)`);
                                    return parsedEntries;
                                }
                            }
                        }
                    }
                } catch (endpointError) {
                    console.log(`Endpoint attempt failed: ${endpointError.message}`);
                }
            }
        } catch (variantError) {
            console.log(`Language variant attempt failed: ${variantError.message}`);
        }
    }

    throw new Error(`Could not find ${auto ? 'auto-generated' : 'manual'} captions for language: ${lang}`);
}

module.exports = {
    fetchCaptionsWithFallback
};
