const express = require('express');
const router = express.Router();
const { getSubtitles } = require('youtube-captions-scraper');
const { spawn } = require('child_process');
const { ApiError, ErrorTypes } = require('../utils/api-utils');

class CaptionsService {
    static formatTimestamp(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
    }

    static formatCaptions(captions, includeTimestamps = true) {
        return captions
            .map(caption => {
                if (includeTimestamps) {
                    const timestamp = this.formatTimestamp(Math.floor(caption.start));
                    return `${timestamp} ${caption.text}`;
                }
                return caption.text;
            })
            .join('\n')
            .trim();
    }

    static async fetchCaptions(videoId, lang = 'en', auto = false) {
        try {
            const captions = await getSubtitles({
                videoID: videoId,
                lang: lang,
                ...(auto && { auto: true })
            });

            if (!captions || captions.length === 0) {
                return null;
            }

            return captions;
        } catch (error) {
            console.log(`${auto ? 'Auto-generated' : 'Manual'} captions not found:`, error.message);
            return null;
        }
    }

    static extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        if (!match) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Invalid YouTube URL');
        }
        return match[1];
    }
}

// IMPORTANT: /video-meta, /download-links, and /fetch MUST be before /:videoId
// Otherwise Express matches "video-meta" as a videoId parameter

// GET /api/captions/video-meta/:videoId - Fetch video metadata (title, description, author)
router.get('/video-meta/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
        const oembedRes = await fetch(oembedUrl);
        let meta = { title: 'Unknown', author: 'Unknown', description: '', thumbnail: '', url: `https://www.youtube.com/watch?v=${videoId}` };

        if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            meta.title = oembed.title || 'Unknown';
            meta.author = oembed.author_name || 'Unknown';
            meta.thumbnail = oembed.thumbnail_url || '';
        }

        // Fetch YouTube page for description from meta tag
        try {
            const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
                headers: { 'Accept-Language': 'en-US,en;q=0.9' }
            });
            if (pageRes.ok) {
                const html = await pageRes.text();
                const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)
                    || html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
                if (descMatch && descMatch[1]) {
                    meta.description = descMatch[1]
                        .replace(/&/g, '&')
                        .replace(/</g, '<')
                        .replace(/>/g, '>')
                        .replace(/"/g, '"')
                        .replace(/&#39;/g, "'");
                }
            }
        } catch (e) {
            console.log(`Could not fetch video description: ${e.message}`);
        }

        res.json(meta);
    } catch (error) {
        console.error('Video meta error:', error.message);
        res.json({
            title: 'Unknown',
            author: 'Unknown',
            description: '',
            thumbnail: '',
            url: `https://www.youtube.com/watch?v=${videoId}`
        });
    }
});

// GET /api/captions/download-links/:videoId - Get available download formats via yt-dlp
router.get('/download-links/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const args = [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            '-f', 'best',
            '--format-sort', 'res:720',
            url
        ];

        const result = await new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            const proc = spawn('yt-dlp', args, { timeout: 30000 });
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', code => {
                if (code === 0) resolve(stdout);
                else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
            });
            proc.on('error', reject);
        });

        const info = JSON.parse(result);

        // Categorize formats
        const videoAudio = [];
        const audioOnly = [];
        const videoOnly = [];

        const formats = info.formats || [];
        for (const f of formats) {
            if (!f.url) continue;
            const hasVideo = f.vcodec && f.vcodec !== 'none';
            const hasAudio = f.acodec && f.acodec !== 'none';
            const size = f.filesize || f.filesize_approx || 0;
            const sizeStr = size > 0 ? `${(size / 1048576).toFixed(1)}MB` : 'Unknown';

            const entry = {
                quality: f.format_note || f.resolution || `${f.height || '?'}p`,
                ext: f.ext || 'mp4',
                size: sizeStr,
                url: f.url
            };

            if (hasVideo && hasAudio) {
                videoAudio.push(entry);
            } else if (hasAudio && !hasVideo) {
                audioOnly.push(entry);
            } else if (hasVideo && !hasAudio) {
                videoOnly.push(entry);
            }
        }

        // Sort by quality (resolution number) descending
        const parseRes = (q) => parseInt(q) || 0;
        videoAudio.sort((a, b) => parseRes(b.quality) - parseRes(a.quality));
        audioOnly.sort((a, b) => parseRes(b.quality) - parseRes(a.quality));
        videoOnly.sort((a, b) => parseRes(b.quality) - parseRes(a.quality));

        // Limit to top 10 per category
        res.json({
            videoAudio: videoAudio.slice(0, 10),
            audioOnly: audioOnly.slice(0, 10),
            videoOnly: videoOnly.slice(0, 10),
            title: info.title || 'Unknown'
        });
    } catch (error) {
        console.error('Download links error:', error.message);
        res.status(500).json({ error: 'Failed to fetch download links', details: error.message });
    }
});

// New endpoint for v4
router.get('/fetch', async (req, res) => {
    try {
        const { url, auto = 'true' } = req.query;
        if (!url) {
            throw new ApiError(ErrorTypes.VALIDATION, 'URL parameter is required', 400);
        }

        const videoId = CaptionsService.extractVideoId(url);
        const lang = 'en';
        const allowAuto = auto === 'true';

        console.log(`${new Date().toISOString()} - Fetching captions for video ID: ${videoId}`);
        console.log(`Language: ${lang}, Allow Auto-generated: ${allowAuto}`);

        let captions = await CaptionsService.fetchCaptions(videoId, lang, false);
        let isAutoGenerated = false;

        if (!captions && allowAuto) {
            console.log('Attempting to fetch auto-generated captions...');
            captions = await CaptionsService.fetchCaptions(videoId, lang, true);
            isAutoGenerated = true;
        }

        if (!captions) {
            throw new ApiError(
                ErrorTypes.API,
                `This video does not have any ${allowAuto ? '' : 'manual '}captions available. Please try a different video.`,
                404
            );
        }

        const formattedCaptions = CaptionsService.formatCaptions(captions, true);
        console.log(`Successfully fetched ${isAutoGenerated ? 'auto-generated' : 'manual'} captions. Length: ${formattedCaptions.length} characters`);

        res.json({
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [{
                        languageCode: lang,
                        name: { 
                            simpleText: `English${isAutoGenerated ? ' (auto-generated)' : ''}`
                        },
                        baseUrl: formattedCaptions
                    }]
                }
            }
        });

    } catch (error) {
        console.error('Error fetching captions:', error);
        
        const status = error instanceof ApiError ? error.status : 404;
        res.status(status).json({ 
            error: 'Captions not found',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Legacy endpoint for v3 compatibility — MUST be last (catches /:videoId)
router.get('/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    const lang = req.query.lang || 'en';
    const allowAuto = req.query.auto === 'true';
    const includeTimestamps = req.query.timestamps === 'true';
    
    console.log(`${new Date().toISOString()} - Fetching captions for video ID: ${videoId}`);
    console.log(`Language: ${lang}, Allow Auto-generated: ${allowAuto}`);

    try {
        let captions = await CaptionsService.fetchCaptions(videoId, lang, false);

        if (!captions && allowAuto) {
            console.log('Attempting to fetch auto-generated captions...');
            captions = await CaptionsService.fetchCaptions(videoId, lang, true);
        }

        if (!captions) {
            throw new ApiError(
                ErrorTypes.API,
                `This video does not have any ${allowAuto ? '' : 'manual '}captions available. Please try a different video.`,
                404
            );
        }

        const formattedCaptions = CaptionsService.formatCaptions(captions, includeTimestamps);
        console.log(`Successfully fetched captions. Length: ${formattedCaptions.length} characters`);
        res.send(formattedCaptions);

    } catch (error) {
        console.error('Error processing request:', error);
        
        const status = error instanceof ApiError ? error.status : 404;
        res.status(status).json({
            error: 'Captions not found',
            videoId,
            language: lang,
            autoGenerated: allowAuto,
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;