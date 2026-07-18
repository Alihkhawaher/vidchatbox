// Browser-side video transcription using Whisper (via @huggingface/transformers)
// Uses ffmpeg.wasm to convert YouTube audio in-browser (no server-side ffmpeg needed)
// Models are cached in the browser (Cache API / IndexedDB) for offline use

const Transcriber = (() => {
    let transcriberPipeline = null;
    let isModelLoading = false;
    let modelLoadPromise = null;
    let ffmpegInstance = null;

    const MODELS = {
        tiny: 'Xenova/whisper-tiny',       // ~64MB, fastest, OK quality
        base: 'Xenova/whisper-base',       // ~136MB, good balance
        small: 'Xenova/whisper-small',     // ~510MB, best quality (slower)
    };

    const DEFAULT_MODEL = 'base'; // Good Arabic quality

    // Load the Transformers.js library dynamically via ES module
    async function loadTransformers() {
        if (window.pipeline) return window.pipeline;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Failed to load Transformers.js (timeout)'));
            }, 60000);

            window.addEventListener('transformers-ready', () => {
                clearTimeout(timeout);
                resolve(window.pipeline);
            }, { once: true });

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

        if (onProgress) {
            onProgress({ stage: 'loading_ffmpeg', message: 'Loading ffmpeg.wasm...' });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/libs/ffmpeg/ffmpeg.js';
            script.onload = async () => {
                try {
                    const { FFmpeg } = FFmpegWASM;
                    const ffmpeg = new FFmpeg();
                    
                    ffmpeg.on('log', ({ message }) => {
                        console.log('[ffmpeg]', message);
                    });
                    
                    ffmpeg.on('progress', ({ progress }) => {
                        if (onProgress && progress >= 0) {
                            onProgress({ 
                                stage: 'converting', 
                                message: `Converting audio: ${Math.round(progress * 100)}%`,
                                progress: Math.round(progress * 100)
                            });
                        }
                    });

                    await ffmpeg.load({
                        coreURL: '/libs/ffmpeg/ffmpeg-core.js',
                        wasmURL: '/libs/ffmpeg/ffmpeg-core.wasm',
                    });

                    ffmpegInstance = ffmpeg;
                    resolve(ffmpeg);
                } catch (err) {
                    reject(err);
                }
            };
            script.onerror = () => reject(new Error('Failed to load ffmpeg.wasm'));
            document.head.appendChild(script);
        });
    }

    // Convert raw audio bytes to 16kHz mono WAV using ffmpeg.wasm
    async function convertToWav(audioBuffer, onProgress) {
        const ffmpeg = await loadFFmpeg(onProgress);

        if (onProgress) {
            onProgress({ stage: 'converting', message: 'Converting audio to WAV...' });
        }

        // Write input audio to ffmpeg filesystem
        await ffmpeg.writeFile('input.webm', new Uint8Array(audioBuffer));

        // Convert to 16kHz mono WAV (what Whisper expects)
        await ffmpeg.exec([
            '-i', 'input.webm',
            '-ar', '16000',    // 16kHz sample rate
            '-ac', '1',        // mono
            '-f', 'wav',       // WAV format
            '-acodec', 'pcm_s16le', // 16-bit PCM
            'output.wav'
        ]);

        // Read the output
        const data = await ffmpeg.readFile('output.wav');

        // Clean up
        await ffmpeg.deleteFile('input.webm');
        await ffmpeg.deleteFile('output.wav');

        return data;
    }

    // Extract Float32Array from WAV bytes (skip 44-byte header)
    function wavToFloat32(wavBytes) {
        // WAV header is 44 bytes for standard PCM
        const headerSize = 44;
        const dataBytes = wavBytes.slice(headerSize);
        
        // Create Int16Array from raw bytes
        const int16 = new Int16Array(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength / 2);
        
        // Convert to Float32Array normalized to [-1, 1]
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        
        return float32;
    }

    // Initialize the Whisper model (loads once, cached afterward)
    async function initModel(modelSize, onProgress) {
        if (transcriberPipeline) return transcriberPipeline;
        if (modelLoadPromise) return modelLoadPromise;

        isModelLoading = true;
        const modelId = MODELS[modelSize] || MODELS[DEFAULT_MODEL];

        modelLoadPromise = (async () => {
            try {
                const pipelineFn = await loadTransformers();

                if (onProgress) {
                    onProgress({ stage: 'loading_model', model: modelId, message: 'Loading Whisper model (first time downloads ~136MB)...' });
                }

                transcriberPipeline = await pipelineFn('automatic-speech-recognition', modelId, {
                    chunk_length_s: 30,
                    stride_length_s: 5,
                    progress_callback: (progress) => {
                        if (onProgress) {
                            if (progress.status === 'download') {
                                onProgress({
                                    stage: 'downloading',
                                    file: progress.file,
                                    progress: progress.progress,
                                    loaded: progress.loaded,
                                    total: progress.total,
                                    message: `Downloading model: ${progress.file} (${Math.round(progress.progress || 0)}%)`
                                });
                            } else if (progress.status === 'initiate') {
                                onProgress({
                                    stage: 'initiating',
                                    file: progress.file,
                                    message: `Initializing: ${progress.file}`
                                });
                            } else if (progress.status === 'done') {
                                onProgress({
                                    stage: 'ready',
                                    file: progress.file,
                                    message: `Ready: ${progress.file}`
                                });
                            }
                        }
                    }
                });

                isModelLoading = false;
                return transcriberPipeline;
            } catch (err) {
                isModelLoading = false;
                modelLoadPromise = null;
                throw err;
            }
        })();

        return modelLoadPromise;
    }

    // Fetch audio from our server proxy
    async function fetchAudio(videoId, onProgress) {
        if (onProgress) {
            onProgress({ stage: 'fetching_audio', message: 'Downloading audio from YouTube...' });
        }

        const response = await fetch(`/api/audio/${videoId}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch audio');
        }

        if (onProgress) {
            onProgress({ stage: 'decoding_audio', message: 'Received audio, converting...' });
        }

        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
    }

    // Format transcription result to match vidchatbox caption format
    function formatResult(result) {
        if (!result || !result.chunks) {
            return result?.text || '';
        }

        return result.chunks.map(chunk => {
            const start = chunk.timestamp?.[0] || 0;
            const hours = Math.floor(start / 3600);
            const minutes = Math.floor((start % 3600) / 60);
            const seconds = Math.floor(start % 60);
            const ts = `[${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
            return `${ts} ${chunk.text.trim()}`;
        }).join('\n');
    }

    // Main transcribe function
    async function transcribe(videoId, language, modelSize, onProgress) {
        // Step 1: Initialize Whisper model
        await initModel(modelSize || DEFAULT_MODEL, onProgress);

        // Step 2: Fetch raw audio from server
        const rawAudio = await fetchAudio(videoId, onProgress);

        // Step 3: Convert to WAV using ffmpeg.wasm (in-browser)
        const wavBytes = await convertToWav(rawAudio, onProgress);

        // Step 4: Extract Float32 PCM data from WAV
        const audioData = wavToFloat32(wavBytes);

        // Step 5: Transcribe with Whisper
        if (onProgress) {
            onProgress({ stage: 'transcribing', message: 'Transcribing audio... (this may take a while)' });
        }

        const result = await transcriberPipeline(audioData, {
            language: language || 'ar',
            task: 'transcribe',
            return_timestamps: true,
            chunk_length_s: 30,
            stride_length_s: 5,
        });

        // Step 6: Format output
        if (onProgress) {
            onProgress({ stage: 'complete', message: 'Transcription complete!' });
        }

        return formatResult(result);
    }

    // Check if browser supports required APIs
    function isSupported() {
        return !!(window.AudioContext || window.webkitAudioContext) &&
               typeof WebAssembly !== 'undefined';
    }

    return {
        transcribe,
        isSupported,
        initModel,
        MODELS,
        DEFAULT_MODEL
    };
})();

// Export for use in main.js
window.Transcriber = Transcriber;