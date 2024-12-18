class YouTubeCaptions {
    async fetchData(url) {
        try {
            console.log('Fetching:', url);
            
            // In browser, proxy through our server
            const fetchUrl = typeof window !== 'undefined' 
                ? `/api/captions/fetch?url=${encodeURIComponent(url)}`
                : url;
            
            const response = await fetch(fetchUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error (${response.status}): ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Received response data');
            return data;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    async getCaptions(videoId, language = 'en') {
        try {
            console.log('Getting captions for video:', videoId, 'language:', language);
            
            // Fetch the video data using our backend endpoint
            const data = await this.fetchData(`https://youtube.com/watch?v=${videoId}`);

            // Check for errors in the response
            if (data.error) {
                console.error('API Error:', data.error);
                throw new Error(data.error.message || 'YouTube API error');
            }

            // Extract captions from the response
            const captionsData = data?.captions?.playerCaptionsTracklistRenderer;
            if (!captionsData) {
                console.error('No captions data found in response');
                throw new Error(`Could not find captions for video: ${videoId}`);
            }

            // Get available caption tracks
            const captionTracks = captionsData.captionTracks;
            if (!captionTracks || captionTracks.length === 0) {
                console.error('No caption tracks found');
                throw new Error(`No caption tracks available for video: ${videoId}`);
            }

            console.log('Available caption tracks:', captionTracks.map(t => `${t.languageCode} (${t.name?.simpleText})`));

            // Find the requested language track
            const subtitle = captionTracks.find(track => track.languageCode === language);

            // Ensure we found a usable caption track
            if (!subtitle || !subtitle.baseUrl) {
                console.error('No suitable caption track found');
                throw new Error(`Could not find ${language} captions for ${videoId}`);
            }

            // Log which track we're using
            console.log(`Using caption track: ${subtitle.languageCode} (${subtitle.name?.simpleText})`);

            // Return the captions directly since baseUrl now contains the formatted text
            return subtitle.baseUrl;

        } catch (error) {
            console.error('Caption extraction error:', error);
            throw error;
        }
    }
}

// Support both browser and Node.js environments
if (typeof window !== 'undefined') {
    window.YouTubeCaptions = YouTubeCaptions;
} else {
    module.exports = YouTubeCaptions;
}

// Add test function for Node.js environment
if (typeof window === 'undefined' && require.main === module) {
    const fetch = require('node-fetch');
    
    async function testCaptions() {
        const client = new YouTubeCaptions();
        try {
            // Test with Rick Astley video
            const videoId = 'dQw4w9WgXcQ';
            console.log('Testing English captions...');
            const enCaptions = await client.getCaptions(videoId, 'en');
            console.log('\nEnglish Captions:\n', enCaptions.slice(0, 500), '...\n');

            console.log('Testing Arabic captions...');
            const arCaptions = await client.getCaptions(videoId, 'ar');
            console.log('\nArabic Captions:\n', arCaptions.slice(0, 500), '...\n');
        } catch (error) {
            console.error('Test failed:', error.message);
        }
    }

    testCaptions();
}
