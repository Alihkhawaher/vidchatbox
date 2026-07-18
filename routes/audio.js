const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const { PassThrough } = require('stream');

// GET /api/audio/:videoId - Stream YouTube audio for browser-side transcription
// Uses yt-dlp (must be installed on server) which is more reliable than ytdl-core
router.get('/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`${new Date().toISOString()} - Audio stream requested for video: ${videoId}`);

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // First, get video info to check duration
        execFile('yt-dlp', ['--dump-json', '--no-playlist', url], { timeout: 30000 }, (err, stdout, stderr) => {
            if (err) {
                console.error('yt-dlp info error:', err.message);
                return res.status(500).json({
                    error: 'Failed to get video info',
                    details: err.message,
                    videoId
                });
            }

            let info;
            try {
                info = JSON.parse(stdout);
            } catch (parseErr) {
                return res.status(500).json({ error: 'Failed to parse video info', videoId });
            }

            const duration = info.duration || 0;
            if (duration > 7200) {
                return res.status(400).json({
                    error: 'Video too long for browser transcription (max 2 hours)',
                    videoId,
                    duration
                });
            }

            console.log(`Audio stream: "${info.title}" (${duration}s)`);

            // Stream audio as webm/opus using yt-dlp
            res.setHeader('Content-Type', 'audio/webm');
            res.setHeader('Content-Disposition', `inline; filename="${videoId}.webm"`);
            res.setHeader('Cache-Control', 'no-store');

            const ytdlp = execFile('yt-dlp', [
                '--no-playlist',
                '-f', 'worstaudio',
                '-o', '-',  // output to stdout
                '--no-warnings',
                url
            ], { maxBuffer: 1024 * 1024 * 100 }, (err) => {
                if (err && !res.headersSent) {
                    console.error('yt-dlp stream error:', err.message);
                    res.status(500).json({ error: 'Audio stream failed', details: err.message });
                }
            });

            ytdlp.stdout.pipe(res);

            ytdlp.on('close', () => {
                if (!res.writableEnded) {
                    res.end();
                }
            });

            req.on('close', () => {
                ytdlp.kill('SIGTERM');
            });
        });

    } catch (error) {
        console.error('Audio route error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to get audio stream',
                videoId,
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

module.exports = router;