const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');

// Limit concurrent audio streams — each stream spawns yt-dlp child processes
// and can last up to 2 hours. This app serves a small number of users, so
// 5 concurrent streams is plenty and prevents bandwidth/CPU exhaustion.
const MAX_CONCURRENT_STREAMS = 5;
let activeStreams = 0;

// GET /api/audio/:videoId - Stream raw YouTube audio for browser-side processing
// Server is a thin proxy — all conversion happens in the browser via ffmpeg.wasm
router.get('/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    if (activeStreams >= MAX_CONCURRENT_STREAMS) {
        return res.status(429).json({
            error: `Server busy — max ${MAX_CONCURRENT_STREAMS} concurrent audio streams. Try again shortly.`,
            activeStreams
        });
    }
    activeStreams++;
    let released = false;
    const releaseStream = () => {
        if (released) return;
        released = true;
        activeStreams = Math.max(0, activeStreams - 1);
    };
    res.on('close', releaseStream);
    res.on('error', releaseStream);


    console.log(`${new Date().toISOString()} - Audio stream requested for video: ${videoId}`);

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // First, get video info to check duration
        const infoProc = spawn('yt-dlp', ['--dump-json', '--no-playlist', url], { timeout: 30000 });
        let infoStdout = '';
        let infoStderr = '';
        infoProc.stdout.on('data', d => { infoStdout += d.toString(); });
        infoProc.stderr.on('data', d => { infoStderr += d.toString(); });

        infoProc.on('close', (code) => {
            if (code !== 0) {
                console.error('yt-dlp info error:', infoStderr);
                if (!res.headersSent) {
                    return res.status(500).json({
                        error: 'Failed to get video info',
                        details: infoStderr.slice(0, 200),
                        videoId
                    });
                }
                return;
            }

            let info;
            try {
                info = JSON.parse(infoStdout);
            } catch (parseErr) {
                if (!res.headersSent) {
                    return res.status(500).json({ error: 'Failed to parse video info', videoId });
                }
                return;
            }

            const duration = info.duration || 0;
            if (duration > 43200) {
                if (!res.headersSent) {
                    return res.status(400).json({
                        error: 'Video too long (max 12 hours)',
                        videoId,
                        duration
                    });
                }
                return;
            }

            console.log(`Audio stream: "${info.title}" (${duration}s)`);

            // Stream raw audio — browser handles conversion via ffmpeg.wasm
            // Prefer WebM/Opus (format 249/251) for OpenRouter compatibility
            // Fallback to any audio if WebM isn't available
            res.setHeader('Cache-Control', 'no-store');

            const ytdlp = spawn('yt-dlp', [
                '--no-playlist',
                '-f', 'worstaudio[ext=webm]/worstaudio',
                '-o', '-',
                '--no-warnings',
                url
            ]);

            // Detect format from first bytes to set correct Content-Type
            let headerDetected = false;
            const headerBuf = [];
            ytdlp.stdout.on('data', (chunk) => {
                if (!headerDetected) {
                    headerBuf.push(chunk);
                    // Accumulate enough bytes for format detection
                    const total = Buffer.concat(headerBuf);
                    if (total.length >= 12) {
                        headerDetected = true;
                        // WebM magic: 0x1A45DFA3
                        const isWebM = total[0] === 0x1A && total[1] === 0x45 && total[2] === 0xDF && total[3] === 0xA3;
                        // OGG magic: OggS
                        const isOgg = total[0] === 0x4F && total[1] === 0x67 && total[2] === 0x67 && total[3] === 0x53;
                        // RIFF/WAV magic: RIFF
                        const isRIFF = total[0] === 0x52 && total[1] === 0x49 && total[2] === 0x46 && total[3] === 0x46;
                        // MP4/M4A ftyp box
                        const isMP4 = total[4] === 0x66 && total[5] === 0x74 && total[6] === 0x79 && total[7] === 0x70;

                        let contentType = 'audio/webm';
                        let ext = 'webm';
                        if (isWebM) { contentType = 'audio/webm'; ext = 'webm'; }
                        else if (isOgg) { contentType = 'audio/ogg'; ext = 'ogg'; }
                        else if (isRIFF) { contentType = 'audio/wav'; ext = 'wav'; }
                        else if (isMP4) { contentType = 'audio/mp4'; ext = 'm4a'; }

                        res.setHeader('Content-Type', contentType);
                        res.setHeader('Content-Disposition', `inline; filename="${videoId}.${ext}"`);
                        console.log(`Audio format detected: ${contentType} (ext=${ext})`);

                        // Flush buffered header bytes
                        for (const buf of headerBuf) {
                            res.write(buf);
                        }
                        // Remove this listener — subsequent data goes through default pipe
                        ytdlp.stdout.removeAllListeners('data');
                        ytdlp.stdout.pipe(res);
                    }
                }
            });

            ytdlp.stderr.on('data', () => {}); // suppress progress

            ytdlp.on('error', (err) => {
                console.error('yt-dlp error:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'yt-dlp failed', details: err.message });
                }
            });

            ytdlp.on('close', (code) => {
                if (!res.writableEnded) {
                    res.end();
                }
                if (code !== 0) {
                    console.error(`yt-dlp exited with code ${code}`);
                }
            });

            req.on('close', () => {
                ytdlp.kill('SIGTERM');
            });
        });

        infoProc.on('error', (err) => {
            console.error('yt-dlp info process error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Failed to start yt-dlp',
                    videoId,
                    details: err.message
                });
            }
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

// POST /api/audio/transcribe-cloud - Server-side cloud STT
// YouTube → yt-dlp → OpenRouter STT → transcription text
// Audio never touches the browser for cloud mode.
router.post('/transcribe-cloud', async (req, res) => {
    const { videoId, apiKey, model, language } = req.body;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    if (!apiKey) {
        return res.status(400).json({ error: 'API key required for cloud transcription' });
    }

    console.log(`${new Date().toISOString()} - Cloud STT requested for video: ${videoId}, model: ${model}`);

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // Step 1: Download audio via yt-dlp and convert to WAV via ffmpeg
        // WAV is universally supported by all OpenRouter STT providers
        const audioBuffer = await new Promise((resolve, reject) => {
            // yt-dlp → ffmpeg → WAV
            const ytdlp = spawn('yt-dlp', [
                '--no-playlist',
                '-f', 'worstaudio',
                '-o', '-',
                '--no-warnings',
                url
            ]);

            const ffmpeg = spawn('ffmpeg', [
                '-i', 'pipe:0',
                '-ar', '16000',
                '-ac', '1',
                '-f', 'wav',
                '-acodec', 'pcm_s16le',
                'pipe:1'
            ], { stdio: ['pipe', 'pipe', 'pipe'] });

            const chunks = [];
            ytdlp.stdout.pipe(ffmpeg.stdin);
            ffmpeg.stdout.on('data', d => chunks.push(d));

            ytdlp.stderr.on('data', () => {});
            ffmpeg.stderr.on('data', () => {});

            ffmpeg.on('close', code => {
                if (code === 0) resolve(Buffer.concat(chunks));
                else reject(new Error(`ffmpeg exited with code ${code}`));
            });

            ytdlp.on('close', code => {
                if (code !== 0) {
                    ffmpeg.kill('SIGTERM');
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });

            ytdlp.on('error', reject);
            ffmpeg.on('error', reject);
        });

        console.log(`Audio converted to WAV: ${(audioBuffer.length / 1048576).toFixed(1)} MB`);

        // Step 2: Split WAV into 5-minute chunks
        // OpenRouter STT has a 60s upstream timeout per request
        // Chunking prevents timeouts and handles long videos
        const CHUNK_DURATION_SEC = 300; // 5 minutes
        const SAMPLE_RATE = 16000;
        const BYTES_PER_SAMPLE = 2; // 16-bit PCM
        const CHANNELS = 1;
        const WAV_HEADER_SIZE = 44;
        const bytesPerSecond = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS;
        const chunkBytes = CHUNK_DURATION_SEC * bytesPerSecond;
        const pcmData = audioBuffer.slice(WAV_HEADER_SIZE);
        const totalChunks = Math.ceil(pcmData.length / chunkBytes);

        console.log(`Audio duration: ~${Math.round(pcmData.length / bytesPerSecond)}s, splitting into ${totalChunks} chunk(s)`);

        const sttModel = model || 'openai/whisper-large-v3';
        const transcripts = [];
        let totalUsage = { seconds: 0, cost: 0 };

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkBytes;
            const end = Math.min(start + chunkBytes, pcmData.length);
            const chunkPcm = pcmData.slice(start, end);
            const chunkDuration = chunkPcm.length / bytesPerSecond;

            // Build WAV header for this chunk
            const wavHeader = Buffer.alloc(44);
            wavHeader.write('RIFF', 0);
            wavHeader.writeUInt32LE(36 + chunkPcm.length, 4);
            wavHeader.write('WAVE', 8);
            wavHeader.write('fmt ', 12);
            wavHeader.writeUInt32LE(16, 16);
            wavHeader.writeUInt16LE(1, 20); // PCM
            wavHeader.writeUInt16LE(CHANNELS, 22);
            wavHeader.writeUInt32LE(SAMPLE_RATE, 24);
            wavHeader.writeUInt32LE(bytesPerSecond, 28);
            wavHeader.writeUInt16LE(BYTES_PER_SAMPLE * CHANNELS, 32);
            wavHeader.writeUInt16LE(16, 34); // bits per sample
            wavHeader.write('data', 36);
            wavHeader.writeUInt32LE(chunkPcm.length, 40);

            const chunkWav = Buffer.concat([wavHeader, chunkPcm]);
            const base64Chunk = chunkWav.toString('base64');

            console.log(`Sending chunk ${i + 1}/${totalChunks}: ${chunkDuration.toFixed(0)}s, ${(chunkWav.length / 1048576).toFixed(1)} MB`);

            try {
                const sttResponse = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': process.env.APP_URL,
                        'X-Title': 'VidChatBox'
                    },
                    body: JSON.stringify({
                        model: sttModel,
                        input_audio: {
                            data: base64Chunk,
                            format: 'wav'
                        },
                        language: language || 'ar'
                    }),
                    signal: AbortSignal.timeout(120000)
                });

                if (!sttResponse.ok) {
                    const errorText = await sttResponse.text();
                    console.error(`Chunk ${i + 1} failed: ${sttResponse.status} - ${errorText}`);
                    // Continue with other chunks instead of failing entirely
                    transcripts.push(`[Chunk ${i + 1} failed: ${sttResponse.status}]`);
                    continue;
                }

                const sttResult = await sttResponse.json();
                transcripts.push(sttResult.text || '');
                if (sttResult.usage) {
                    totalUsage.seconds += sttResult.usage.seconds || 0;
                    totalUsage.cost += sttResult.usage.cost || 0;
                }
                console.log(`Chunk ${i + 1} complete: ${(sttResult.text || '').length} chars`);
            } catch (chunkError) {
                console.error(`Chunk ${i + 1} error: ${chunkError.message}`);
                transcripts.push(`[Chunk ${i + 1} error: ${chunkError.message}]`);
            }
        }

        const fullText = transcripts.join('\n');
        console.log(`Cloud STT complete: ${fullText.length} chars, ${totalChunks} chunks`);

        res.json({
            text: fullText,
            usage: totalUsage,
            model: sttModel,
            chunks: totalChunks
        });

    } catch (error) {
        console.error('Cloud STT error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Cloud transcription failed',
                details: error.message
            });
        }
    }
});

// POST /api/audio/transcribe — Browser-side STT proxy
// Browser sends base64 audio + metadata, server forwards to OpenRouter STT API
// This avoids CORS issues (OpenRouter STT doesn't allow browser requests)
router.post('/transcribe', async (req, res) => {
    const { audioData, format, model, language, response_format, timestamp_granularities } = req.body;

    if (!audioData) {
        return res.status(400).json({ error: 'audioData (base64) is required' });
    }

    // Get API key from Authorization header
    const authHeader = req.headers.authorization || '';
    const apiKey = authHeader.replace('Bearer ', '');
    if (!apiKey) {
        return res.status(400).json({ error: 'Authorization header with API key required' });
    }

    const sttModel = model || 'microsoft/mai-transcribe-1.5';
    const audioFormat = format || 'mp3';

    console.log(`${new Date().toISOString()} - STT proxy: model=${sttModel}, format=${audioFormat}, size=${(audioData.length * 0.75 / 1048576).toFixed(1)}MB`);

    try {
        const sttResponse = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: sttModel,
                input_audio: { data: audioData, format: audioFormat },
                ...(response_format && { response_format }),
                ...(timestamp_granularities && { timestamp_granularities }),
                language: language || 'ar'
            }),
            signal: AbortSignal.timeout(120000)
        });

        if (!sttResponse.ok) {
            const errorText = await sttResponse.text();
            console.error(`STT proxy error: ${sttResponse.status} - ${errorText.slice(0, 200)}`);
            return res.status(sttResponse.status).json({ error: errorText.slice(0, 500) });
        }

        const result = await sttResponse.json();
        console.log(`STT proxy success: ${(result.text || '').length} chars`);
        res.json(result);
    } catch (error) {
        console.error('STT proxy error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'STT proxy failed', details: error.message });
        }
    }
});

module.exports = router;
