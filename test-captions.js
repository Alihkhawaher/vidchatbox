const { getSubtitles } = require('youtube-captions-scraper');

// Format timestamp from seconds to [HH:MM:SS]
function formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
}

// Format captions with timestamps
function formatCaptions(captions) {
    return captions.map(caption => {
        const timestamp = formatTimestamp(caption.start);
        return `${timestamp} ${caption.text}`;
    }).join('\n');
}

// Test function
async function testCaptions() {
    try {
        // Test with Rick Astley video
        const videoId = 'dQw4w9WgXcQ';
        
        console.log('Testing English captions...');
        const enCaptions = await getSubtitles({
            videoID: videoId,
            lang: 'en'
        });
        console.log('\nEnglish Captions:\n', formatCaptions(enCaptions).slice(0, 500), '...\n');

        console.log('Testing Arabic captions...');
        const arCaptions = await getSubtitles({
            videoID: videoId,
            lang: 'ar'
        });
        console.log('\nArabic Captions:\n', formatCaptions(arCaptions).slice(0, 500), '...\n');
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Run the test
testCaptions();
