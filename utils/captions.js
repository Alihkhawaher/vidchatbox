const axios = require('axios');
const { getSubtitles } = require('youtube-captions-scraper');

async function fetchCaptionsWithFallback(videoId, lang, auto = false) {
    try {
        // First try with youtube-captions-scraper
        const captions = await getSubtitles({
            videoID: videoId,
            lang: lang,
            auto: auto
        });

        if (captions && captions.length > 0) {
            return captions;
        }
    } catch (error) {
        console.log(`youtube-captions-scraper failed: ${error.message}`);
    }

    // Fallback to direct API request
    try {
        console.log('Attempting fallback caption fetch method...');
        const timedtext_url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${auto ? '&kind=asr' : ''}`;
        const response = await axios.get(timedtext_url);
        
        if (response.data) {
            // Parse the XML response
            const text = response.data;
            if (text.includes('<transcript>')) {
                // Extract and parse caption entries
                const entries = text.match(/<text[^>]*>(.*?)<\/text>/g) || [];
                return entries.map(entry => {
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
                            .replace(/&#39;/g, "'");
                        
                        return {
                            start,
                            dur: duration,
                            text
                        };
                    }
                    return null;
                }).filter(Boolean);
            }
        }
    } catch (error) {
        console.log(`Fallback method failed: ${error.message}`);
    }

    throw new Error(`Could not find ${auto ? 'auto-generated' : 'manual'} captions for language: ${lang}`);
}

module.exports = {
    fetchCaptionsWithFallback
};
