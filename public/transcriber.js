// Browser-side video transcription using Whisper (via @huggingface/transformers)
// Uses ffmpeg.wasm to convert YouTube audio in-browser (no server-side ffmpeg needed)
// Models are cached in the browser (Cache API / IndexedDB) for offline use
//
// Cloud STT pipeline (tested & verified):
//   Server streams raw audio → Browser detects format → ffmpeg.wasm converts to Opus (32kbps)
//   with optional atempo speed-up → Split into 10-min chunks → Server proxy → OpenRouter
//   Dynamic chunk normalization merges tiny trailing chunks to prevent 500 errors
//   Opus is 8x smaller than WAV, 4x smaller than MP3
//   Test results: Opus + atempo works with mai-transcribe-1.5 at all speeds (1.0x-2.0x)
//   whisper-large-v3 does NOT support speed changes — garbled/empty output at 1.5x+

const Transcriber = (() => {
    let transcriberPipeline = null;
    let isModelLoading = false;
    let modelLoadPromise = null;
    let ffmpegInstance = null;
    let abortController = null;
    let isTranscribing = false;

    const MODELS = {
        // Local models (browser-side Whisper)
        'whisper-medium': { name: 'Xenova/whisper-medium', quantized: true, size: '~680MB' },
        'whisper-small': { name: 'Xenova/whisper-small', quantized: true, size: '~510MB' },
        // Cloud models (keys MUST match settings values exactly)
        'openrouter-whisper-large-v3': { name: 'openai/whisper-large-v3', cloud: true },
        'openrouter-gpt-4o-transcribe': { name: 'openai/gpt-4o-transcribe', cloud: true },
        'openrouter-mai-transcribe': { name: 'microsoft/mai-transcribe-1.5', cloud: true },
        'openrouter-gpt-4o-mini-transcribe': { name: 'openai/gpt-4o-mini-transcribe', cloud: true },
        'openrouter-whisper-1': { name: 'openai/whisper-1', cloud: true },
        // Legacy mappings
        tiny: { name: 'Xenova/whisper-tiny', quantized: true },
        base: { name: 'Xenova/whisper-base', quantized: true },
        small: { name: 'Xenova/whisper-small', quantized: true },
    };

    const DEFAULT_MODEL = 'whisper-medium';

    function hasWebGPU() {
        return !!(navigator.gpu && navigator.gpu.requestAdapter);
    }

    function getPreferredModel() {
        try {
            const settings = JSON.parse(localStorage.getItem('vidchatbox_settings') || '{}');
            return settings.whisperModel || DEFAULT_MODEL;
        } catch (e) {
            return DEFAULT_MODEL;
        }
    }

    function setPreferredModel(model) {
        try {
            const settings = JSON.parse(localStorage.getItem('vidchatbox_settings') || '{}');
            settings.whisperModel = model;
            localStorage.setItem('vidchatbox_settings', JSON.stringify(settings));
        } catch (e) { /* ignore */ }
    }

    function isRunning() { return isTranscribing; }

    function abort() {
        if (abortController) { abortController.abort(); abortController = null; }
        isTranscribing = false;
    }

    // Load Transformers.js dynamically
    async function loadTransformers() {
        if (window.pipeline) return window.pipeline;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Failed to load Transformers.js (timeout)')), 60000);
            window.addEventListener('transformers-ready', () => { clearTimeout(timeout); resolve(window.pipeline); }, { once: true });
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
                env.allowLocalModels = false;
                window.pipeline = pipeline;
                window._transformersReady = true;
                window.dispatchEvent(new Event('transformers-ready'));
            `;
            document.head.appendChild(script);
        });
    }

    // Load ffmpeg.wasm for browser-side audio conversion
    async function loadFFmpeg(onProgress) {
        if (ffmpegInstance) return ffmpegInstance;
        if (onProgress) onProgress({ stage: 'loading_ffmpeg', message: 'Loading ffmpeg.wasm...' });

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/libs/ffmpeg/ffmpeg.js';
            script.onload = async () => {
                try {
                    const { FFmpeg } = FFmpegWASM;
                    const ffmpeg = new FFmpeg();
                    ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));
                    ffmpeg.on('progress', ({ progress }) => {
                        if (onProgress && progress >= 0) {
                            onProgress({ stage: 'converting', message: `Converting: ${Math.round(progress * 100)}%`, progress: Math.round(progress * 100) });
                        }
                    });
                    await ffmpeg.load({ coreURL: '/libs/ffmpeg/ffmpeg-core.js', wasmURL: '/libs/ffmpeg/ffmpeg-core.wasm' });
                    ffmpegInstance = ffmpeg;
                    resolve(ffmpeg);
                } catch (err) { reject(err); }
            };
            script.onerror = () => reject(new Error('Failed to load ffmpeg.wasm'));
            document.head.appendChild(script);
        });
    }

    // Detect audio container format from magic bytes
    function detectAudioFormat(buffer) {
        const bytes = new Uint8Array(buffer.slice(0, 12));
        if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'webm';
        if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'wav';
        if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'm4a';
        if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3';
        if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) return 'flac';
        return 'webm';
    }

    // Chunked base64 encoding to avoid RangeError on large files
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        }
        return btoa(binary);
    }

    // Convert audio to Opus (32kbps, 16kHz mono) and split into 10-minute chunks
    // Dynamic chunk normalization merges tiny trailing chunks (< 50% avg size)
    // Prevents 500 errors on small final chunks (e.g., 0.42MB / 2min)
    // Opus is 8x smaller than WAV, 4x smaller than MP3
    // Opus + atempo: mai-transcribe-1.5 works perfectly at all speeds (1.0x-2.0x)
    // whisper-large-v3 does NOT support speed changes well — garbled/empty output
    async function convertForCloud(audioBuffer, inputFormat, speed, onProgress) {
        const ffmpeg = await loadFFmpeg(onProgress);
        const needsSpeedUp = speed && speed !== '1.0';

        if (onProgress) {
            onProgress({ stage: 'converting', message: needsSpeedUp ? `Converting & speeding up (${speed}x)...` : 'Converting to Opus chunks...' });
        }

        const args = ['-i', `input.${inputFormat}`];

        if (needsSpeedUp) {
            // Build atempo filter chain (each atempo supports 0.5-2.0 range)
            let filter = '';
            let remaining = parseFloat(speed);
            while (remaining > 2.0) { filter += (filter ? ',' : '') + 'atempo=2.0'; remaining /= 2.0; }
            filter += (filter ? ',' : '') + `atempo=${remaining.toFixed(2)}`;
            args.push('-filter:a', filter);
        }

        // Convert to Opus 32kbps 16kHz mono, split into 6-minute segments
        // 6 min = uniform chunks, no tiny trailing segments
        // 42-min video → 7 chunks of ~6 min each (last: 5.8 min)
        // Each chunk ~1.7MB raw, ~2.3MB base64 — well under upstream timeout
        args.push(
            '-ar', '16000', '-ac', '1',
            '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip',
            '-f', 'segment', '-segment_time', '360',
            '-reset_timestamps', '1',
            'chunk_%03d.opus'
        );

        await ffmpeg.writeFile(`input.${inputFormat}`, new Uint8Array(audioBuffer));
        await ffmpeg.exec(args);

        // Read all chunk files
        const rawChunks = [];
        let chunkIndex = 0;
        while (true) {
            const chunkName = `chunk_${String(chunkIndex).padStart(3, '0')}.opus`;
            try {
                const chunkData = await ffmpeg.readFile(chunkName);
                rawChunks.push(chunkData.buffer);
                await ffmpeg.deleteFile(chunkName);
                chunkIndex++;
            } catch (e) {
                // No more chunks
                break;
            }
        }

        await ffmpeg.deleteFile(`input.${inputFormat}`);

        if (rawChunks.length === 0) throw new Error('No audio chunks produced');

        // ffmpeg's segment muxer doesn't write EOS (end-of-stream) on the last Opus page.
        // OpenRouter's STT parser rejects Ogg streams without EOS → 500 error.
        // Fix: re-mux ALL chunks with -c copy to add the missing EOS page.
        // Applies to single AND multi-chunk — even single chunks (short videos) need EOS.
        // File sizes are identical (proven: 1394385 bytes before and after).
        for (let ci = 0; ci < rawChunks.length; ci++) {
            try {
                await ffmpeg.writeFile(`fix_in_${ci}.opus`, new Uint8Array(rawChunks[ci]));
                await ffmpeg.exec(['-i', `fix_in_${ci}.opus`, '-c', 'copy', `fix_out_${ci}.opus`]);
                const fixedData = await ffmpeg.readFile(`fix_out_${ci}.opus`);
                rawChunks[ci] = fixedData.buffer;
                await ffmpeg.deleteFile(`fix_in_${ci}.opus`);
                await ffmpeg.deleteFile(`fix_out_${ci}.opus`);
            } catch (e) {
                // Re-mux failed — use original (most STT APIs tolerate missing EOS)
                console.warn(`[Transcriber] Chunk ${ci} EOS fix failed, using original:`, e.message);
            }
        }

        const chunks = rawChunks.map(buf => ({ data: buf, format: 'opus' }));
        return chunks;
    }

    // Convert raw audio to Float32Array for local Whisper transcription
    async function convertToFloat32(audioBuffer, onProgress) {
        if (onProgress) onProgress({ stage: 'converting', message: 'Converting audio with ffmpeg.wasm...' });
        const ffmpeg = await loadFFmpeg(onProgress);
        const inputFormat = detectAudioFormat(audioBuffer);

        await ffmpeg.writeFile(`input.${inputFormat}`, new Uint8Array(audioBuffer));
        await ffmpeg.exec(['-i', `input.${inputFormat}`, '-ar', '16000', '-ac', '1', '-f', 'wav', '-acodec', 'pcm_s16le', 'output.wav']);
        const wavData = await ffmpeg.readFile('output.wav');
        await ffmpeg.deleteFile(`input.${inputFormat}`);
        await ffmpeg.deleteFile('output.wav');

        const headerSize = 44;
        const pcmBytes = wavData.slice(headerSize);
        const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
        return float32;
    }

    async function initModel(modelSize, onProgress) {
        if (transcriberPipeline) return transcriberPipeline;
        if (modelLoadPromise) return modelLoadPromise;
        isModelLoading = true;
        const modelEntry = MODELS[modelSize] || MODELS[DEFAULT_MODEL];
        const modelId = typeof modelEntry === 'string' ? modelEntry : modelEntry.name;

        modelLoadPromise = (async () => {
            try {
                const pipelineFn = await loadTransformers();
                if (onProgress) onProgress({ stage: 'loading_model', model: modelId, message: 'Loading Whisper model...' });
                transcriberPipeline = await pipelineFn('automatic-speech-recognition', modelId, {
                    chunk_length_s: 30, stride_length_s: 5,
                    progress_callback: (progress) => {
                        if (onProgress) {
                            if (progress.status === 'download') onProgress({ stage: 'downloading', file: progress.file, progress: progress.progress, loaded: progress.loaded, total: progress.total, message: `Downloading: ${progress.file} (${Math.round(progress.progress || 0)}%)` });
                            else if (progress.status === 'initiate') onProgress({ stage: 'initiating', file: progress.file, message: `Initializing: ${progress.file}` });
                            else if (progress.status === 'done') onProgress({ stage: 'ready', file: progress.file, message: `Ready: ${progress.file}` });
                        }
                    }
                });
                isModelLoading = false;
                return transcriberPipeline;
            } catch (err) { isModelLoading = false; modelLoadPromise = null; throw err; }
        })();
        return modelLoadPromise;
    }

    async function fetchAudio(videoId, onProgress) {
        if (onProgress) onProgress({ stage: 'fetching_audio', message: 'Downloading audio from YouTube...' });
        const response = await fetch(`/api/audio/${videoId}`);
        if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Failed to fetch audio'); }
        if (onProgress) onProgress({ stage: 'decoding_audio', message: 'Received audio, converting...' });
        return await response.arrayBuffer();
    }

    function formatResult(result) {
        if (!result || !result.chunks) return result?.text || '';
        return result.chunks.map(chunk => {
            const start = chunk.timestamp?.[0] || 0;
            const h = Math.floor(start / 3600), m = Math.floor((start % 3600) / 60), s = Math.floor(start % 60);
            return `[${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}] ${chunk.text.trim()}`;
        }).join('\n');
    }

    // Main transcribe function — routes to local or cloud based on model
    async function transcribe(videoId, language, modelSize, onProgress) {
        const mId = modelSize || DEFAULT_MODEL;
        const modelEntry = MODELS[mId] || MODELS[DEFAULT_MODEL];
        const isCloud = typeof modelEntry === 'object' && modelEntry.cloud;
        if (isCloud) return await transcribeCloud(videoId, language, modelEntry, onProgress);
        else return await transcribeLocal(videoId, language, mId, onProgress);
    }

    // Cloud STT: Server streams raw audio → ffmpeg.wasm → Opus → Server proxy → OpenRouter
    // Pipeline tested & verified: Opus + atempo works with mai-transcribe-1.5 at all speeds
    // whisper-large-v3 does NOT support speed changes — garbled/empty output at 1.5x+
    // Uses server proxy to avoid CORS (OpenRouter STT doesn't allow browser requests)
    async function transcribeCloud(videoId, language, modelEntry, onProgress) {
        if (onProgress) onProgress({ stage: 'fetching_audio', message: 'Downloading audio...' });

        let apiKey = '', audioSpeed = '1.0';
        try {
            const settings = JSON.parse(localStorage.getItem('vidchatbox_settings') || '{}');
            apiKey = settings.openrouterApiKey || '';
            audioSpeed = settings.audioSpeed || '1.0';
        } catch (e) {}

        if (!apiKey) throw new Error('OpenRouter API key is required for cloud transcription. Add it in Settings → Cloud AI.');

        const sttModel = modelEntry.name || 'openai/whisper-large-v3';

        // Step 1: Download raw audio from server
        const audioResponse = await fetch(`/api/audio/${videoId}`);
        if (!audioResponse.ok) { const error = await audioResponse.json().catch(() => ({})); throw new Error(error.error || 'Failed to download audio'); }
        const rawAudio = await audioResponse.arrayBuffer();

        // Step 2: Detect format — prefer server Content-Type, fall back to magic bytes
        const serverContentType = audioResponse.headers.get('Content-Type') || '';
        let audioFormat;
        if (serverContentType.includes('webm')) audioFormat = 'webm';
        else if (serverContentType.includes('ogg')) audioFormat = 'ogg';
        else if (serverContentType.includes('wav') || serverContentType.includes('wave')) audioFormat = 'wav';
        else if (serverContentType.includes('mp4') || serverContentType.includes('m4a')) audioFormat = 'm4a';
        else if (serverContentType.includes('mpeg') || serverContentType.includes('mp3')) audioFormat = 'mp3';
        else audioFormat = detectAudioFormat(rawAudio); // fallback to magic bytes
        console.log(`[Transcriber] Audio: ${audioFormat}, ${(rawAudio.byteLength / 1048576).toFixed(1)}MB, speed: ${audioSpeed}x, model: ${sttModel}`);

        // Step 3: Convert to Opus with optional speed-up using ffmpeg.wasm
        const chunks = await convertForCloud(rawAudio, audioFormat, audioSpeed, onProgress);

        // Step 4: Send each chunk via server proxy (avoids CORS — OpenRouter STT has no browser CORS)
        if (onProgress) onProgress({ stage: 'transcribing', message: `Transcribing ${chunks.length} chunk(s) with ${sttModel}...` });

        const transcripts = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkSizeMB = (chunk.data.byteLength / 1048576).toFixed(2);
            console.log(`[Transcriber] Chunk ${i + 1}/${chunks.length}: ${chunkSizeMB}MB ${chunk.format}`);

            if (onProgress && chunks.length > 1) onProgress({ stage: 'transcribing', message: `Chunk ${i + 1}/${chunks.length} (${chunkSizeMB}MB)...` });

            const base64Audio = arrayBufferToBase64(chunk.data);
            const sttResponse = await fetch('/api/audio/transcribe', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audioData: base64Audio,
                    format: chunk.format,
                    model: sttModel,
                    language: language || 'ar'
                }),
                signal: AbortSignal.timeout(120000)
            });

            if (!sttResponse.ok) {
                const errorData = await sttResponse.json().catch(() => ({}));
                const rawError = errorData.error || '';
                const errMsg = getSTTErrorMessage(sttResponse.status, rawError);
                console.error(`[Transcriber] Chunk ${i + 1} failed: ${errMsg}`);
                transcripts.push(`[Chunk ${i + 1} failed: ${errMsg}]`);
                continue;
            }

            const result = await sttResponse.json();
            transcripts.push(result.text || '');
            console.log(`[Transcriber] Chunk ${i + 1} done: ${(result.text || '').length} chars`);
        }

        if (onProgress) onProgress({ stage: 'complete', message: 'Cloud transcription complete!' });
        return transcripts.join('\n');
    }

    // Local transcription: browser-side Whisper
    async function transcribeLocal(videoId, language, modelSize, onProgress) {
        await initModel(modelSize || DEFAULT_MODEL, onProgress);
        const rawAudio = await fetchAudio(videoId, onProgress);
        const audioData = await convertToFloat32(rawAudio, onProgress);
        if (onProgress) onProgress({ stage: 'transcribing', message: 'Transcribing audio... (this may take a while)' });
        const result = await transcriberPipeline(audioData, { language: language || 'ar', task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
        if (onProgress) onProgress({ stage: 'complete', message: 'Transcription complete!' });
        return formatResult(result);
    }

    // Map OpenRouter STT error codes to user-friendly messages
    function getSTTErrorMessage(status, rawError) {
        switch (status) {
            case 402:
                return 'OpenRouter account needs credits. Add funds at openrouter.ai/settings';
            case 413:
                return 'Audio too large for server (413). Try a shorter video.';
            case 422:
                return 'Audio format rejected by provider (422). The server may need to re-encode the audio.';
            case 500:
                return 'Transcription server error (500). Try again or use shorter segments.';
            case 502:
                return 'Transcription service timed out (502). Try again or use shorter segments.';
            case 400:
                if (rawError.includes('large audio') || rawError.includes('large'))
                    return 'Audio too large for this model. Try a shorter segment.';
                return `Transcription request invalid (400): ${rawError.slice(0, 100)}`;
            case 429:
                return 'Too many requests (429). Please wait and try again.';
            case 503:
                return 'Transcription service unavailable (503). Try again later.';
            default:
                return `STT error (${status}): ${rawError.slice(0, 200)}`;
        }
    }

    function isSupported() {
        return !!(window.AudioContext || window.webkitAudioContext) && typeof WebAssembly !== 'undefined';
    }

    // Subtitle mode: uses whisper-large-v3-turbo with verbose_json for segment timestamps
    // Returns { text, segments } for SRT/VTT generation
    async function transcribeWithSubtitles(videoId, language, onProgress) {
        if (onProgress) onProgress({ stage: 'fetching_audio', message: 'Downloading audio for subtitles...' });

        let apiKey = '', audioSpeed = '1.0';
        try {
            const settings = JSON.parse(localStorage.getItem('vidchatbox_settings') || '{}');
            apiKey = settings.openrouterApiKey || '';
            audioSpeed = settings.audioSpeed || '1.0';
        } catch (e) {}

        if (!apiKey) throw new Error('OpenRouter API key is required. Add it in Settings → Cloud AI.');

        const sttModel = 'openai/whisper-large-v3-turbo';

        // Download raw audio from server
        const audioResponse = await fetch(`/api/audio/${videoId}`);
        if (!audioResponse.ok) { const error = await audioResponse.json().catch(() => ({})); throw new Error(error.error || 'Failed to download audio'); }
        const rawAudio = await audioResponse.arrayBuffer();

        const serverContentType = audioResponse.headers.get('Content-Type') || '';
        let audioFormat;
        if (serverContentType.includes('webm')) audioFormat = 'webm';
        else if (serverContentType.includes('ogg')) audioFormat = 'ogg';
        else if (serverContentType.includes('wav') || serverContentType.includes('wave')) audioFormat = 'wav';
        else if (serverContentType.includes('mp4') || serverContentType.includes('m4a')) audioFormat = 'm4a';
        else if (serverContentType.includes('mpeg') || serverContentType.includes('mp3')) audioFormat = 'mp3';
        else audioFormat = detectAudioFormat(rawAudio);
        console.log(`[Transcriber] Subtitle audio: ${audioFormat}, ${(rawAudio.byteLength / 1048576).toFixed(1)}MB, model: ${sttModel}`);

        const chunks = await convertForCloud(rawAudio, audioFormat, audioSpeed, onProgress);

        if (onProgress) onProgress({ stage: 'transcribing', message: `Generating subtitles with ${sttModel}...` });

        const transcripts = [];
        const allSegments = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkSizeMB = (chunk.data.byteLength / 1048576).toFixed(2);
            if (onProgress && chunks.length > 1) onProgress({ stage: 'transcribing', message: `Subtitle chunk ${i + 1}/${chunks.length} (${chunkSizeMB}MB)...` });

            const base64Audio = arrayBufferToBase64(chunk.data);
            const sttResponse = await fetch('/api/audio/transcribe', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audioData: base64Audio,
                    format: chunk.format,
                    model: sttModel,
                    language: language || 'ar',
                    response_format: 'verbose_json',
                    timestamp_granularities: ['segment']
                }),
                signal: AbortSignal.timeout(120000)
            });

            if (!sttResponse.ok) {
                const errorData = await sttResponse.json().catch(() => ({}));
                const errMsg = getSTTErrorMessage(sttResponse.status, errorData.error || '');
                console.error(`[Transcriber] Subtitle chunk ${i + 1} failed: ${errMsg}`);
                transcripts.push(`[Chunk ${i + 1} failed]`);
                continue;
            }

            const result = await sttResponse.json();
            transcripts.push(result.text || '');

            if (result.segments && result.segments.length > 0) {
                const chunkOffset = i * 360; // 6-min chunks
                for (const seg of result.segments) {
                    allSegments.push({
                        text: (seg.text || '').trim(),
                        start: (seg.start || 0) + chunkOffset,
                        end: (seg.end || 0) + chunkOffset
                    });
                }
                console.log(`[Transcriber] Subtitle chunk ${i + 1}: ${result.segments.length} segments`);
            }
        }

        if (onProgress) onProgress({ stage: 'complete', message: 'Subtitles generated!' });
        return { text: transcripts.join('\n'), segments: allSegments };
    }

    return { transcribe, transcribeWithSubtitles, isSupported, initModel, hasWebGPU, getPreferredModel, setPreferredModel, isRunning, abort, loadFFmpeg, MODELS, DEFAULT_MODEL };
})();

window.Transcriber = Transcriber;