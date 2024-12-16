module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const videoId = req.url.split('/').pop().split('?')[0];
    const lang = req.query.lang || 'en';
    const auto = req.query.auto === 'true';
    
    if (!videoId) {
        return res.status(400).json({
            error: 'Missing video ID',
            timestamp: new Date().toISOString()
        });
    }

    // Instead of fetching captions, return URLs for the client to fetch
    return res.status(200).json({
        trackListUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`,
        captionsUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${auto ? '&kind=asr' : ''}&fmt=json3`
    });
};
