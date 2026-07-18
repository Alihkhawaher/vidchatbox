// ===== Browser-Side LLM Chat (WebLLM) =====
// Runs LLM inference entirely in the browser using WebGPU
// No API key needed, fully private, no server dependency

const ChatLLM = (function() {
    // WebLLM engine instance
    let engine = null;
    let currentModelId = null;
    let isInitializing = false;
    let abortController = null;

    // Model definitions — Bonsai uses Transformers.js, Qwen/Llama use WebLLM
    const BONSAI_MODELS = {
        'Bonsai-1.7B': {
            hfId: 'onnx-community/Bonsai-1.7B-ONNX',
            size: '~200MB',
            label: 'Bonsai 1.7B ⭐',
            quality: '1-bit quantized, tiny download, fast',
            tier: 'bonsai',
            dtype: 'q1',
        },
        'Ternary-Bonsai-1.7B': {
            hfId: 'onnx-community/Ternary-Bonsai-1.7B-ONNX',
            size: '~300MB',
            label: 'Ternary Bonsai 1.7B',
            quality: 'Ternary (2-bit), slightly better quality',
            tier: 'bonsai',
            dtype: 'q2',
        },
    };

    const WEBLLM_MODELS = {
        'Qwen3-4B-q4f16_1-MLC': {
            size: '~2.6GB',
            label: 'Qwen3 4B (WebLLM)',
            quality: 'Best balance of speed & quality',
            tier: 'medium'
        },
        'Qwen3-1.7B-q4f16_1-MLC': {
            size: '~1.2GB',
            label: 'Qwen3 1.7B (WebLLM)',
            quality: 'Fast, good for quick questions',
            tier: 'small'
        },
        'SmolLM2-1.7B-Instruct-q4f16_1-MLC': {
            size: '~1.1GB',
            label: 'SmolLM2 1.7B (WebLLM)',
            quality: 'Fastest, lightweight',
            tier: 'small'
        },
        'Qwen3-8B-q4f16_1-MLC': {
            size: '~5.2GB',
            label: 'Qwen3 8B (WebLLM)',
            quality: 'Highest quality, large download',
            tier: 'large'
        },
    };

    const MODELS = { ...BONSAI_MODELS, ...WEBLLM_MODELS };
    const DEFAULT_MODEL = 'Bonsai-1.7B';

    // Bonsai engine state (Transformers.js)
    let bonsaiPipeline = null;
    let bonsaiModelId = null;

    // Check WebGPU support
    function isSupported() {
        return 'gpu' in navigator;
    }

    function hasWebGPU() {
        return 'gpu' in navigator;
    }

    // Get/set preferred model — use Settings module
    function getPreferredModel() {
        return (window.Settings ? Settings.get('webllmModel') : localStorage.getItem('webllmModel')) || DEFAULT_MODEL;
    }

    function setPreferredModel(modelId) {
        if (window.Settings) {
            Settings.set('webllmModel', modelId);
        } else {
            localStorage.setItem('webllmModel', modelId);
        }
    }

    // Get or initialize the engine
    async function getEngine(modelId, onProgress) {
        // If engine exists with the same model, reuse it
        if (engine && currentModelId === modelId) {
            return engine;
        }

        // If already initializing, wait
        if (isInitializing) {
            throw new Error('Model is currently loading. Please wait...');
        }

        isInitializing = true;

        try {
            // Dynamically import WebLLM
            const webllm = await import('/web-llm/index.js');

            // Create progress callback
            const initProgressCallback = (report) => {
                if (onProgress) {
                    onProgress({
                        stage: report.progress === 1 ? 'ready' : 'downloading',
                        progress: Math.round((report.progress || 0) * 100),
                        message: report.text || 'Loading model...',
                        loaded: report.loaded || 0,
                        total: report.total || 0
                    });
                }
            };

            // Create engine with progress tracking
            engine = await webllm.CreateMLCEngine(
                modelId,
                { initProgressCallback }
            );

            currentModelId = modelId;
            return engine;
        } catch (err) {
            engine = null;
            currentModelId = null;
            throw err;
        } finally {
            isInitializing = false;
        }
    }

    // Abort current generation
    function abort() {
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    }

    // Check if engine is loaded (Bonsai or WebLLM)
    function isReady() {
        return (engine !== null && currentModelId !== null) || (bonsaiPipeline !== null && bonsaiModelId !== null);
    }

    function getLoadedModel() {
        return currentModelId || bonsaiModelId;
    }

    // Check if a model is a Bonsai model (uses Transformers.js)
    function isBonsai(modelId) {
        return modelId in BONSAI_MODELS;
    }

    // Get or create Bonsai pipeline via Transformers.js
    async function getBonsaiPipeline(modelId, onProgress) {
        if (bonsaiPipeline && bonsaiModelId === modelId) {
            return bonsaiPipeline;
        }

        const modelConfig = BONSAI_MODELS[modelId];
        if (!modelConfig) throw new Error(`Unknown Bonsai model: ${modelId}`);

        if (onProgress) {
            onProgress({ stage: 'loading_model', message: `Loading ${modelConfig.label}...` });
        }

        const { pipeline, TextStreamer } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');

        bonsaiPipeline = await pipeline('text-generation', modelConfig.hfId, {
            device: 'webgpu',
            dtype: modelConfig.dtype,
            progress_callback: (event) => {
                if (!onProgress) return;
                if (event.status === 'progress_total') {
                    onProgress({
                        stage: 'downloading',
                        progress: Math.round(event.progress || 0),
                        loaded: event.loaded,
                        total: event.total,
                        message: `Downloading ${modelConfig.label}: ${Math.round(event.progress || 0)}%`
                    });
                }
            }
        });

        bonsaiModelId = modelId;
        if (onProgress) {
            onProgress({ stage: 'ready', message: `${modelConfig.label} loaded!` });
        }

        return bonsaiPipeline;
    }

    // Generate chat response with streaming
    async function* generateStream(message, captions, modelId, onProgress) {
        const mId = modelId || getPreferredModel();

        // Build messages array
        const messages = [];
        if (captions && captions.trim()) {
            messages.push({
                role: 'system',
                content: `You are a helpful assistant analyzing a YouTube video. Here are the video's captions/transcript:\n\n${captions}\n\nAnswer the user's questions about this video based on these captions. Be concise and helpful.`
            });
        } else {
            messages.push({
                role: 'system',
                content: 'You are a helpful assistant. Be concise and helpful.'
            });
        }
        messages.push({ role: 'user', content: message });

        abortController = new AbortController();

        try {
            if (isBonsai(mId)) {
                // ===== Bonsai via Transformers.js (streaming via queue) =====
                const gen = await getBonsaiPipeline(mId, onProgress);
                const { TextStreamer } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');

                // Event-driven queue: resolve promise when token arrives
                const tokenQueue = [];
                let generationDone = false;
                let resolveToken = null;

                const streamer = new TextStreamer(gen.tokenizer, {
                    skip_prompt: true,
                    skip_special_tokens: true,
                    callback_function: (text) => {
                        tokenQueue.push(text);
                        if (resolveToken) {
                            resolveToken();
                            resolveToken = null;
                        }
                    },
                });

                // Start generation in background
                gen(messages, {
                    max_new_tokens: 2048,
                    do_sample: true,
                    temperature: 0.7,
                    top_k: 20,
                    top_p: 0.8,
                    streamer: streamer,
                }).then(() => {
                    generationDone = true;
                    if (resolveToken) {
                        resolveToken();
                        resolveToken = null;
                    }
                }).catch(() => {
                    generationDone = true;
                    if (resolveToken) {
                        resolveToken();
                        resolveToken = null;
                    }
                });

                // Yield chunks as tokens arrive (event-driven, no busy-wait)
                let fullContent = '';
                while (!generationDone || tokenQueue.length > 0) {
                    if (tokenQueue.length > 0) {
                        const text = tokenQueue.shift();
                        fullContent += text;
                        yield { type: 'chunk', content: text, fullContent };
                    } else if (!generationDone) {
                        // Wait for next token (event-driven)
                        await new Promise(r => { resolveToken = r; });
                    }
                }

                yield { type: 'final', content: '', fullContent };

            } else {
                // ===== WebLLM (Qwen/Llama) =====
                const eng = await getEngine(mId, onProgress);

                const chunks = await eng.chat.completions.create({
                    messages,
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 2048,
                    stream: true
                });

                let fullContent = '';
                for await (const chunk of chunks) {
                    if (abortController?.signal?.aborted) break;
                    const delta = chunk.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        fullContent += delta;
                        yield { type: 'chunk', content: delta, fullContent: fullContent };
                    }
                }
                yield { type: 'final', content: '', fullContent: fullContent };
            }

        } catch (err) {
            if (err.name === 'AbortError' || abortController?.signal?.aborted) {
                yield { type: 'final', content: '', fullContent: '' };
            } else {
                throw err;
            }
        } finally {
            abortController = null;
        }
    }

    // Unload the current model to free memory (both engines)
    async function unload() {
        if (engine) {
            try {
                await engine.unload();
            } catch (e) {
                // ignore
            }
            engine = null;
            currentModelId = null;
        }
        if (bonsaiPipeline) {
            try {
                await bonsaiPipeline.dispose();
            } catch (e) {
                // ignore
            }
            bonsaiPipeline = null;
            bonsaiModelId = null;
        }
    }

    // Public API
    return {
        MODELS,
        DEFAULT_MODEL,
        isSupported,
        hasWebGPU,
        getPreferredModel,
        setPreferredModel,
        getEngine,
        generateStream,
        abort,
        isReady,
        getLoadedModel,
        unload
    };
})();

// Make globally available
window.ChatLLM = ChatLLM;