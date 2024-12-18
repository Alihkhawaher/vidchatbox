const { getSubtitles } = require('youtube-captions-scraper');

// Using Rick Astley's video which we know has captions
const videoId = 'dQw4w9WgXcQ';

async function testVideo() {
    try {
        console.log('Testing video ID:', videoId);
        
        console.log('\nTrying manual captions...');
        try {
            const manualCaptions = await getSubtitles({
                videoID: videoId,
                lang: 'en'
            });
            console.log('Manual captions found:', manualCaptions.length > 0);
            if (manualCaptions.length > 0) {
                console.log('Sample:', manualCaptions[0]);
            }
        } catch (error) {
            console.log('Manual captions error:', error.message);
        }

        console.log('\nTrying auto-generated captions...');
        try {
            const autoCaptions = await getSubtitles({
                videoID: videoId,
                lang: 'en',
                auto: true
            });
            console.log('Auto captions found:', autoCaptions.length > 0);
            if (autoCaptions.length > 0) {
                console.log('Sample:', autoCaptions[0]);
            }
        } catch (error) {
            console.log('Auto captions error:', error.message);
        }
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testVideo();
