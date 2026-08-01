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
            console.log(`${auto ? 'Auto-generated' : 'Manual'} captions not found for lang=${lang}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch captions with language fallback.
     * Tries: youtube-captions-scraper → yt-dlp subtitle download → language fallback.
     * The scraper library sometimes returns empty arrays for videos that DO have captions,
     * so yt-dlp is used as the reliable fallback.
     */
    static async fetchCaptionsWithFallback(videoId, lang = 'en', includeTimestamps = true) {
        // 1. Try youtube-captions-scraper (fast, but broken for some videos)
        let captions = await this.fetchCaptions(videoId, lang, false);
        let isAuto = false;
        if (!captions || captions.length === 0) {
            captions = await this.fetchCaptions(videoId, lang, true);
            isAuto = true;
        }
        if (captions && captions.length > 0) {
            return { captions, lang, isAuto };
        }

        // 2. Scraper returned empty — use yt-dlp to download subtitles directly
        console.log(`Scraper returned 0 captions for lang=${lang}, trying yt-dlp for ${videoId}...`);
        try {
            const ytdlpResult = await this.fetchCaptionsViaYtDlp(videoId, lang);
            if (ytdlpResult && ytdlpResult.length > 0) {
                console.log(`yt-dlp fetched ${ytdlpResult.length} captions for lang=${lang}`);
                return { captions: ytdlpResult, lang, isAuto: false };
            }
        } catch (e) {
            console.log(`yt-dlp caption fetch failed for lang=${lang}: ${e.message}`);
        }

        // 3. Requested language not found — discover available tracks via yt-dlp
        console.log(`Captions for lang=${lang} not found, discovering available tracks for ${videoId}...`);
        try {
            const available = await this.discoverAvailableLanguages(videoId);
            if (available.length === 0) {
                return null; // No captions at all
            }
            // Prefer English, then any manual track, then any auto track
            const preferred = available.find(a => a.lang === 'en' && !a.isAuto)
                || available.find(a => !a.isAuto)
                || available.find(a => a.lang === 'en')
                || available[0];

            console.log(`Falling back to lang=${preferred.lang} (auto=${preferred.isAuto}) for ${videoId}`);

            // Try scraper first for fallback language
            captions = await this.fetchCaptions(videoId, preferred.lang, preferred.isAuto);
            if (captions && captions.length > 0) {
                return { captions, lang: preferred.lang, isAuto: preferred.isAuto };
            }

            // Try yt-dlp for fallback language
            try {
                const ytdlpResult = await this.fetchCaptionsViaYtDlp(videoId, preferred.lang);
                if (ytdlpResult && ytdlpResult.length > 0) {
                    console.log(`yt-dlp fallback fetched ${ytdlpResult.length} captions for lang=${preferred.lang}`);
                    return { captions: ytdlpResult, lang: preferred.lang, isAuto: preferred.isAuto };
                }
            } catch (e) {
                console.log(`yt-dlp fallback failed for lang=${preferred.lang}: ${e.message}`);
            }
        } catch (e) {
            console.log(`Fallback discovery failed: ${e.message}`);
        }

        return null;
    }

    /**
     * Fetch captions using yt-dlp --write-sub/--write-auto-sub.
     * Returns captions in the same format as youtube-captions-scraper: [{start, text}]
     * where start is in seconds (float).
     */
    static async fetchCaptionsViaYtDlp(videoId, lang = 'en') {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        // Use a temp directory to avoid file conflicts
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcb-captions-'));
        const outTemplate = path.join(tmpDir, 'subs');

        return new Promise((resolve, reject) => {
            const args = [
                '--no-playlist',
                '--no-warnings',
                '--skip-download',
                '--sub-format', 'srt',
                '--write-sub',
                '--write-auto-sub',
                '--sub-lang', lang,
                '-o', outTemplate,
                url
            ];

            let stderr = '';
            const proc = spawn('yt-dlp', args, { timeout: 30000 });
            proc.stdout.on('data', () => {});
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', (code) => {
                try {
                    // Find the downloaded SRT file
                    const files = fs.readdirSync(tmpDir);
                    const srtFile = files.find(f => f.endsWith('.srt'));
                    if (!srtFile) {
                        resolve(null);
                        return;
                    }
                    const srtContent = fs.readFileSync(path.join(tmpDir, srtFile), 'utf-8');
                    const captions = this.parseSRTToCaptions(srtContent);
                    resolve(captions);
                } catch (e) {
                    reject(new Error(`Failed to read yt-dlp output: ${e.message}`));
                } finally {
                    // Cleanup temp directory
                    try {
                        fs.rmSync(tmpDir, { recursive: true, force: true });
                    } catch (_) {}
                }
            });
            proc.on('error', reject);
        });
    }

    /**
     * Parse SRT text into caption objects compatible with youtube-captions-scraper format.
     * Returns: [{start: float_seconds, text: string}]
     */
    static parseSRTToCaptions(srtText) {
        const captions = [];
        const blocks = srtText.trim().split(/\n\s*\n/);
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 2) continue;
            // Find the timestamp line (contains " --> ")
            const tsLineIdx = lines.findIndex(l => l.includes('-->'));
            if (tsLineIdx < 0) continue;
            const tsLine = lines[tsLineIdx];
            const [startStr] = tsLine.split('-->').map(s => s.trim());
            const start = this.parseSRTTimestamp(startStr);
            const text = lines.slice(tsLineIdx + 1).join(' ').trim();
            if (!isNaN(start) && text) {
                captions.push({ start, text });
            }
        }
        return captions;
    }

    /** Parse SRT timestamp "HH:MM:SS,mmm" to float seconds */
    static parseSRTTimestamp(str) {
        const match = str.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (!match) return NaN;
        return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
    }

    /**
     * Use yt-dlp to discover which caption languages are available.
     * Returns array of { lang, isAuto } objects.
     */
    static async discoverAvailableLanguages(videoId) {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            const proc = spawn('yt-dlp', ['--dump-json', '--skip-download', '--no-warnings', '--no-playlist', url], { timeout: 25000 });
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', code => {
                if (code !== 0) return reject(new Error(stderr || `yt-dlp exited ${code}`));
                try {
                    const info = JSON.parse(stdout);
                    const result = [];
                    const seen = new Set();
                    // Manual tracks
                    if (info.subtitles) {
                        for (const langCode of Object.keys(info.subtitles)) {
                            if (!seen.has(langCode)) {
                                seen.add(langCode);
                                result.push({ lang: langCode, isAuto: false });
                            }
                        }
                    }
                    // Auto-generated tracks
                    if (info.automatic_captions) {
                        for (const langCode of Object.keys(info.automatic_captions)) {
                            if (!seen.has(langCode)) {
                                seen.add(langCode);
                                result.push({ lang: langCode, isAuto: true });
                            }
                        }
                    }
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Failed to parse yt-dlp output: ${e.message}`));
                }
            });
            proc.on('error', reject);
        });
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
        // Get best video+audio combo up to 1080p. yt-dlp returns requested_formats
        // with separate video/audio URLs when DASH is used.
        const args = [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
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

        // Check if yt-dlp returned separate streams (DASH) or combined
        const videoAudio = [];
        if (info.requested_formats && info.requested_formats.length >= 2) {
            // DASH: separate video + audio streams — browser needs to merge
            const videoStream = info.requested_formats.find(f => f.vcodec && f.vcodec !== 'none');
            const audioStream = info.requested_formats.find(f => f.acodec && f.acodec !== 'none');
            if (videoStream && audioStream) {
                const height = videoStream.height || info.height || 0;
                const vSize = videoStream.filesize || videoStream.filesize_approx || 0;
                const aSize = audioStream.filesize || audioStream.filesize_approx || 0;
                const totalSize = vSize + aSize;
                videoAudio.push({
                    quality: `${height}p`,
                    ext: 'mp4',
                    size: totalSize > 0 ? `${(totalSize / 1048576).toFixed(1)}MB` : 'Unknown',
                    mux: true, // Browser needs to merge video + audio
                    videoUrl: videoStream.url,
                    audioUrl: audioStream.url,
                    videoExt: videoStream.ext || 'mp4',
                    audioExt: audioStream.ext || 'm4a',
                    url: null // No single URL — must download both
                });
            }
        }

        // Also include any combined formats (direct download, no merge needed)
        // These are typically 360p and below via HTTPS, or HLS streams
        const formats = info.formats || [];
        for (const f of formats) {
            if (!f.url) continue;
            const hasVideo = f.vcodec && f.vcodec !== 'none';
            const hasAudio = f.acodec && f.acodec !== 'none';
            if (!hasVideo || !hasAudio) continue;
            const height = f.height || 0;
            if (height > 1080) continue;
            // Skip m3u8/HLS — browsers can't download these directly
            if (f.protocol === 'm3u8' || f.protocol === 'm3u8_native') continue;
            const size = f.filesize || f.filesize_approx || 0;
            const sizeStr = size > 0 ? `${(size / 1048576).toFixed(1)}MB` : 'Unknown';
            videoAudio.push({
                quality: f.format_note || f.resolution || `${height || '?'}p`,
                ext: f.ext || 'mp4',
                size: sizeStr,
                mux: false, // Direct download, no merge needed
                url: f.url
            });
        }

        // Sort: mux formats (high-res) first, then by resolution descending
        const parseRes = (q) => parseInt(q) || 0;
        videoAudio.sort((a, b) => {
            if (a.mux !== b.mux) return a.mux ? -1 : 1; // mux (high-res) first
            return parseRes(b.quality) - parseRes(a.quality);
        });

        res.json({
            videoAudio: videoAudio.slice(0, 10),
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

// GET /api/captions/available/:videoId - List all available subtitle tracks
router.get('/available/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const args = [
            '--dump-json',
            '--skip-download',
            '--no-warnings',
            '--no-playlist',
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
        const title = info.title || null;

        const manualTracks = extractTracks(info.subtitles);
        const autoTracks = extractTracks(info.automatic_captions);

        // Infer spoken language from ASR tracks or info.language
        let spoken = info.language || null;
        if (!spoken && autoTracks.length > 0) {
            spoken = autoTracks[0].lang;
        }

        console.log(`${new Date().toISOString()} - Available subs for ${videoId}: ${manualTracks.length} manual, ${autoTracks.length} auto, spoken: ${spoken}`);

        res.json({
            title,
            spoken,
            manual: manualTracks,
            auto: autoTracks,
        });
    } catch (error) {
        console.error('Available subs error:', error.message);
        res.json({
            title: null,
            spoken: null,
            manual: [],
            auto: [],
            error: 'Could not fetch available subtitle tracks'
        });
    }
});

/** Extract subtitle tracks from yt-dlp subtitles/auto_captions object */
function extractTracks(trackObj) {
    if (!trackObj || typeof trackObj !== 'object') return [];
    const result = [];
    const seen = new Set();
    for (const langCode of Object.keys(trackObj)) {
        if (seen.has(langCode)) continue;
        seen.add(langCode);
        result.push({
            lang: langCode,
            label: ISO_LANG_NAMES[langCode] || langCode,
        });
    }
    return result;
}

/** ISO 639 language name map (common subset used by YouTube) */
const ISO_LANG_NAMES = {
    af: 'Afrikaans', sq: 'Albanian', am: 'Amharic', ar: 'Arabic', hy: 'Armenian',
    az: 'Azerbaijani', eu: 'Basque', be: 'Belarusian', bn: 'Bengali', bs: 'Bosnian',
    bg: 'Bulgarian', my: 'Burmese', ca: 'Catalan', zh: 'Chinese', 'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)',
    hr: 'Croatian', cs: 'Czech', da: 'Danish', nl: 'Dutch', en: 'English',
    eo: 'Esperanto', et: 'Estonian', fi: 'Finnish', fr: 'French', gl: 'Galician',
    ka: 'Georgian', de: 'German', el: 'Greek', gu: 'Gujarati', ht: 'Haitian Creole',
    ha: 'Hausa', he: 'Hebrew', hi: 'Hindi', hu: 'Hungarian', is: 'Icelandic',
    id: 'Indonesian', ga: 'Irish', it: 'Italian', ja: 'Japanese', jv: 'Javanese',
    kn: 'Kannada', kk: 'Kazakh', km: 'Khmer', ko: 'Korean', ku: 'Kurdish',
    ky: 'Kyrgyz', lo: 'Lao', la: 'Latin', lv: 'Latvian', lt: 'Lithuanian',
    lb: 'Luxembourgish', mk: 'Macedonian', mg: 'Malagasy', ms: 'Malay', ml: 'Malayalam',
    mt: 'Maltese', mi: 'Maori', mr: 'Marathi', mn: 'Mongolian', ne: 'Nepali',
    no: 'Norwegian', or: 'Odia', ps: 'Pashto', fa: 'Farsi', pl: 'Polish',
    pt: 'Portuguese', pa: 'Punjabi', ro: 'Romanian', ru: 'Russian', sr: 'Serbian',
    si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali', es: 'Spanish',
    su: 'Sundanese', sw: 'Swahili', sv: 'Swedish', tl: 'Tagalog', tg: 'Tajik',
    ta: 'Tamil', tt: 'Tatar', te: 'Telugu', th: 'Thai', tr: 'Turkish',
    tk: 'Turkmen', uk: 'Ukrainian', ur: 'Urdu', ug: 'Uyghur', uz: 'Uzbek',
    vi: 'Vietnamese', cy: 'Welsh', xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu',
    'ar-SA': 'Arabic (Saudi)', 'en-US': 'English (US)', 'en-GB': 'English (UK)',
    'pt-BR': 'Portuguese (Brazil)', 'pt-PT': 'Portuguese (Portugal)',
    'es-419': 'Spanish (Latin America)', 'fr-CA': 'French (Canada)',
    fil: 'Filipino', haw: 'Hawaiian', ceb: 'Cebuano', hmn: 'Hmong',
};

// Legacy endpoint for v3 compatibility — MUST be last (catches /:videoId)
// Now uses fetchCaptionsWithFallback for automatic language fallback
router.get('/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    const lang = req.query.lang || 'en';
    const includeTimestamps = req.query.timestamps === 'true';
    
    console.log(`${new Date().toISOString()} - Fetching captions for video ID: ${videoId}, lang: ${lang}`);

    try {
        const result = await CaptionsService.fetchCaptionsWithFallback(videoId, lang, includeTimestamps);

        if (!result || !result.captions || result.captions.length === 0) {
            throw new ApiError(
                ErrorTypes.API,
                'This video does not have any captions available. Please try a different video.',
                404
            );
        }

        const formattedCaptions = CaptionsService.formatCaptions(result.captions, includeTimestamps);
        console.log(`Successfully fetched captions (lang=${result.lang}, auto=${result.isAuto}). Length: ${formattedCaptions.length} characters`);
        res.send(formattedCaptions);

    } catch (error) {
        console.error('Error processing request:', error);
        
        const status = error instanceof ApiError ? error.status : 404;
        res.status(status).json({
            error: 'Captions not found',
            videoId,
            language: lang,
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;