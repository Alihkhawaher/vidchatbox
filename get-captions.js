const { getSubtitles } = require('youtube-captions-scraper');

const videoId = 'H1u5rgxsKeU';

async function getArabicCaptions() {
    try {
        const captions = await getSubtitles({
            videoID: videoId,
            lang: 'ar',
            auto: true
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
                .join('\n');
            
            console.log('Successfully fetched Arabic captions:');
            console.log('\n' + fullText);
        }
    } catch (error) {
        console.error('Error fetching captions:', error.message);
    }
}

getArabicCaptions();
