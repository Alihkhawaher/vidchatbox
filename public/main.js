// ⚠️ VERSION: When modifying this file, bump the version in index.html:
//    mainScript.src = '/main.js?v=YYYYMMDD-N';  (increment N)
//    See ARCHITECTURE.md "Cache Versioning Rule" for details.
//
// ===== Utility Functions =====
function getUILang() {
    return (window.Settings ? Settings.get('selectedLanguage') : null) || 'en';
}

function getTranslated(key, replacements) {
    const lang = getUILang();
    const t = translations[lang]?.status?.[key] || translations['en']?.status?.[key] || key;
    if (!replacements) return t;
    let result = t;
    for (const [k, v] of Object.entries(replacements)) {
        result = result.replace(`{${k}}`, v);
    }
    return result;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// HTML entity escaping using hex escapes to avoid formatter converting entities
const HTML_ENTITIES = {
    38: '\x26amp;',   // &
    60: '\x26lt;',    // <
    62: '\x26gt;',    // >
    34: '\x26quot;',  // "
    39: '\x26#039;',  // &#039;
};

function escapeHtmlEntities(text) {
    return text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char.charCodeAt(0)]);
}

// ===== Chat Persistence =====
const ChatHistory = {
    STORAGE_PREFIX: 'chatHistory_',

    save(videoId, messages) {
        try {
            localStorage.setItem(this.STORAGE_PREFIX + videoId, JSON.stringify(messages));
        } catch (e) {
            logDebug(`Failed to save chat history: ${e.message}`);
        }
    },

    load(videoId) {
        try {
            const raw = localStorage.getItem(this.STORAGE_PREFIX + videoId);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    clear(videoId) {
        localStorage.removeItem(this.STORAGE_PREFIX + videoId);
    },

    getCurrentVideoId() {
        const captionsContent = document.getElementById('captionsContent');
        if (!captionsContent) return null;
        return captionsContent.getAttribute('data-video-id') || null;
    },

    collectMessages() {
        const chatMessages = document.querySelector('.chat-messages');
        if (!chatMessages) return [];

        const messages = [];
        chatMessages.querySelectorAll('.chat-message').forEach(msg => {
            const content = msg.querySelector('.message-content')?.textContent || '';
            const type = msg.classList.contains('user-message') ? 'user' :
                        msg.classList.contains('system-message') ? 'system' : 'ai';
            messages.push({ type, content: content.trim() });
        });
        return messages;
    },

    restoreMessages(messages) {
        const chatResponse = document.getElementById('chatResponse');
        if (!chatResponse || !messages || messages.length === 0) return;

        let chatMessages = chatResponse.querySelector('.chat-messages');
        if (!chatMessages) {
            chatMessages = document.createElement('div');
            chatMessages.className = 'chat-messages';
            chatResponse.innerHTML = '';
            chatResponse.appendChild(chatMessages);
        }
        chatMessages.innerHTML = '';

        for (const msg of messages) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message ${msg.type}-message`;
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = msg.content;
            msgDiv.appendChild(contentDiv);
            if (msg.type !== 'system') {
                msgDiv.appendChild(createCopyButton(msg.content));
            }
            chatMessages.appendChild(msgDiv);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
        showElement('chatResponse');
    },
};

// ===== Browser Transcription UI Functions =====

function showTranscribePrompt(language) {
    return new Promise((resolve) => {
        const container = document.getElementById('content');
        const promptId = 'transcribe-prompt';
        
        const existing = document.getElementById(promptId);
        if (existing) existing.remove();
        
        const prompt = document.createElement('div');
        prompt.id = promptId;
        prompt.className = 'notification is-warning is-light transcribe-prompt';
        const currentModel = window.Transcriber ? Transcriber.getPreferredModel() : 'whisper-medium';
        prompt.innerHTML = `
            <p class="transcribe-prompt-title"><strong>📹 No captions available</strong></p>
            <p class="transcribe-prompt-text">This video doesn't have YouTube captions. Would you like to transcribe the audio in your browser using AI?</p>
            <div class="field">
                <label class="label is-small">Whisper Model</label>
                <div class="select is-small is-fullwidth">
                    <select id="transcribeModelSelect">
                        <optgroup label="Local (browser, no API key)">
                            <option value="whisper-medium" ${currentModel === 'whisper-medium' ? 'selected' : ''}>⭐ whisper-medium (~1.7GB) — Best Arabic quality (WebGPU)</option>
                            <option value="whisper-small" ${currentModel === 'whisper-small' ? 'selected' : ''}>🎯 whisper-small (~510MB) — Fallback / no WebGPU</option>
                        </optgroup>
                        <optgroup label="Cloud (OpenRouter API key required)">
                            <option value="openrouter-whisper-large-v3" ${currentModel === 'openrouter-whisper-large-v3' ? 'selected' : ''}>☁️ Whisper Large V3 — Best quality, instant</option>
                            <option value="openrouter-gpt-4o-transcribe" ${currentModel === 'openrouter-gpt-4o-transcribe' ? 'selected' : ''}>☁️ GPT-4o Transcribe — High quality</option>
                        </optgroup>
                    </select>
                </div>
                <p class="help">WebGPU-accelerated. Cached after first download. English-only models cannot process Arabic.</p>
            </div>
            <div class="buttons">
                <button class="button is-info is-small" id="transcribeYes">
                    <span class="icon is-small"><i class="fas fa-microphone"></i></span>
                    <span>Transcribe Audio</span>
                </button>
                <button class="button is-light is-small" id="transcribeNo">
                    <span>Cancel</span>
                </button>
            </div>
        `;
        
        const loading = document.getElementById('loading');
        if (loading && loading.parentNode) {
            loading.parentNode.insertBefore(prompt, loading);
        } else {
            container.appendChild(prompt);
        }
        
        document.getElementById('transcribeYes').onclick = () => {
            const modelSelect = document.getElementById('transcribeModelSelect');
            const selectedModel = modelSelect ? modelSelect.value : 'whisper-medium';
            if (window.Transcriber) Transcriber.setPreferredModel(selectedModel);
            prompt.remove();
            resolve({ model: selectedModel });
        };
        document.getElementById('transcribeNo').onclick = () => {
            prompt.remove();
            resolve(false);
        };
    });
}

function showTranscribeProgress(message) {
    const container = document.getElementById('content');
    let panel = document.getElementById('transcribe-progress');
    
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'transcribe-progress';
        panel.className = 'notification is-info is-light transcribe-progress';
        const loading = document.getElementById('loading');
        if (loading && loading.parentNode) {
            loading.parentNode.insertBefore(panel, loading);
        } else {
            container.appendChild(panel);
        }
    }
    
    downloadedFiles.clear();
    
    const deviceLabel = window.Transcriber && Transcriber.hasWebGPU() ? 
        '<span class="tag is-success is-light tag-device">⚡ WebGPU</span>' : 
        '<span class="tag is-warning is-light tag-device">WASM</span>';
    
    const aiMode = Settings.get('aiMode') || 'local';
    const settings = Settings.load();
    const hasCloudKey = settings.openrouterApiKey && settings.openrouterApiKey.length > 5;
    const effectiveModel = getEffectiveModel();
    const isCloudModel = effectiveModel && effectiveModel.startsWith('openrouter-');
    
    let headerText;
    let tagText;
    let tagClass;
    if ((aiMode === 'cloud' || aiMode === 'auto') && hasCloudKey && isCloudModel) {
        const modelNames = {
            'openrouter-mai-transcribe': 'Microsoft MAI-Transcribe',
            'openrouter-gpt-4o-transcribe': 'GPT-4o Transcribe',
            'openrouter-gpt-4o-mini-transcribe': 'GPT-4o Mini Transcribe',
            'openrouter-whisper-1': 'Whisper 1',
            'openrouter-whisper-large-v3': 'Whisper Large V3',
        };
        headerText = '☁️ Cloud Transcription';
        tagText = modelNames[effectiveModel] || effectiveModel.replace('openrouter-', '');
        tagClass = 'tag is-warning is-light tag-model';
    } else {
        headerText = '🎙️ Browser Transcription';
        tagText = effectiveModel || 'whisper-medium';
        tagClass = 'tag is-info is-light tag-model';
    }
    const modelLabel = `<span class="${tagClass}">${tagText}</span>`;
    
    panel.innerHTML = `
        <div class="transcribe-progress-header">
            <strong>${headerText}</strong>${deviceLabel}${modelLabel}
        </div>
        <p id="transcribe-status" class="transcribe-status">${message}</p>
        <div class="field">
            <progress id="transcribe-bar" class="progress is-info is-small" value="0" max="100">0%</progress>
        </div>
        <p id="transcribe-detail" class="transcribe-detail"></p>
        <div id="transcribe-download-files" class="transcribe-download-files"></div>
        <div id="transcribe-preview" class="content transcribe-preview"></div>
        <button id="transcribeStopBtn" class="button is-danger is-small is-light">
            <span class="icon is-small"><i class="fas fa-stop"></i></span>
            <span>Stop Transcription</span>
        </button>
    `;

    document.getElementById('transcribeStopBtn').onclick = () => {
        if (window.Transcriber && Transcriber.isRunning()) {
            Transcriber.abort();
        }
    };
}

const downloadedFiles = new Map();

function updateTranscribeProgress(progress) {
    const status = document.getElementById('transcribe-status');
    const bar = document.getElementById('transcribe-bar');
    const detail = document.getElementById('transcribe-detail');
    const filesDiv = document.getElementById('transcribe-download-files');
    
    if (!status) return;
    
    status.textContent = progress.message || 'Processing...';
    
    if (progress.stage === 'downloading') {
        const pct = Math.round(progress.progress || 0);
        if (bar) {
            bar.value = Math.min(pct, 100);
            bar.textContent = `${Math.min(pct, 100)}%`;
        }
        if (detail) {
            const loadedMB = progress.loaded ? (progress.loaded / 1048576).toFixed(0) : '?';
            const totalMB = progress.total ? (progress.total / 1048576).toFixed(0) : '?';
            detail.textContent = `${loadedMB}MB / ${totalMB}MB`;
        }
        if (progress.files && filesDiv) {
            let html = '';
            for (const [name, info] of Object.entries(progress.files)) {
                const shortName = name.split('/').pop();
                const loadedMB = (info.loaded / 1048576).toFixed(0);
                const totalMB = (info.total / 1048576).toFixed(0);
                const filePct = info.total > 0 ? Math.round(info.loaded / info.total * 100) : 0;
                const icon = filePct >= 100 ? '✅' : '⬇️';
                html += `<div>${icon} ${escapeHtml(shortName)}: ${loadedMB}/${totalMB}MB (${filePct}%)</div>`;

            }
            filesDiv.innerHTML = html;
        }
    } else if (progress.stage === 'downloading_file') {
        if (progress.file && progress.loaded && progress.total) {
            downloadedFiles.set(progress.file, {
                loaded: progress.loaded,
                total: progress.total,
            });
        }
    } else if (progress.stage === 'initiating' || progress.stage === 'loading_model') {
        if (bar) bar.removeAttribute('value');
    } else if (progress.stage === 'ready') {
        if (progress.file) {
            downloadedFiles.set(progress.file, {
                ...downloadedFiles.get(progress.file),
                pct: 100
            });
        }
    } else if (progress.stage === 'transcribing') {
        if (filesDiv) filesDiv.innerHTML = '';
        
        if (bar) {
            bar.removeAttribute('value');
            bar.textContent = progress.chunk ? `Chunk ${progress.chunk}...` : 'Transcribing...';
        }
        if (detail && progress.liveText) {
            detail.textContent = progress.liveText.slice(-120);
        } else if (detail && progress.chunk) {
            detail.textContent = progress.message || `Processing chunk ${progress.chunk}...`;
        }
    } else if (progress.stage === 'fetching_audio' || progress.stage === 'decoding_audio') {
        if (bar) bar.removeAttribute('value');
    }
}

function hideTranscribeProgress() {
    const panel = document.getElementById('transcribe-progress');
    if (panel) panel.remove();
}

// ===== Caption Fetching with Progress and Retry =====

function showCaptionProgress(message, percent) {
    let progressDiv = document.getElementById('caption-progress');
    if (!progressDiv) {
        progressDiv = document.createElement('div');
        progressDiv.id = 'caption-progress';
        progressDiv.className = 'notification is-info is-light caption-progress';
        const loading = document.getElementById('loading');
        if (loading && loading.parentNode) {
            loading.parentNode.insertBefore(progressDiv, loading);
        } else {
            const content = document.getElementById('content');
            if (content) content.appendChild(progressDiv);
        }
    }
    
    let html = `<p class="caption-progress-text">${escapeHtml(message)}</p>`;
    if (percent !== undefined) {
        html += `<progress class="progress is-info is-small" value="${percent}" max="100">${percent}%</progress>`;
    } else {
        html += `<progress class="progress is-info is-small" max="100">Processing...</progress>`;
    }
    progressDiv.innerHTML = html;
}

function hideCaptionProgress() {
    const progressDiv = document.getElementById('caption-progress');
    if (progressDiv) progressDiv.remove();
}

function showRetryOption(errorMessage, retryFn) {
    const content = document.getElementById('content');
    if (!content) return;

    const existing = document.getElementById('retry-option');
    if (existing) existing.remove();

    const retryDiv = document.createElement('div');
    retryDiv.id = 'retry-option';
    retryDiv.className = 'notification is-danger is-light retry-option';
    retryDiv.innerHTML = `
        <p class="retry-error-message"><strong>❌ Error:</strong> ${escapeHtml(errorMessage)}</p>
        <p class="retry-suggestion">💡 You can try again — sometimes YouTube caption fetching fails temporarily.</p>
        <div class="buttons">
            <button class="button is-primary is-small" id="retryBtn">
                <span class="icon is-small"><i class="fas fa-redo"></i></span>
                <span>Retry</span>
            </button>
            <button class="button is-light is-small" id="dismissRetryBtn">
                <span>Dismiss</span>
            </button>
        </div>
    `;
    
    const loading = document.getElementById('loading');
    if (loading && loading.parentNode) {
        loading.parentNode.insertBefore(retryDiv, loading);
    } else {
        content.appendChild(retryDiv);
    }

    document.getElementById('retryBtn').onclick = () => {
        retryDiv.remove();
        retryFn();
    };
    document.getElementById('dismissRetryBtn').onclick = () => {
        retryDiv.remove();
    };
}

function getFriendlyErrorMessage(error) {
    const msg = error.message || '';
    
    if (msg.includes('no captions available') || msg.includes('does not have any captions')) {
        return 'This video has no YouTube captions. You can try transcribing the audio with browser AI instead.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return 'Network error — could not reach the server. Check your internet connection and try again.';
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
        return 'Rate limit exceeded — too many requests. Please wait a few minutes and try again.';
    }
    if (msg.includes('Invalid YouTube URL') || msg.includes('Invalid URL')) {
        return 'The URL you entered doesn\'t look like a valid YouTube link. Make sure it includes the video ID (e.g., https://youtube.com/watch?v=XXXXXXX).';
    }
    if (msg.includes('OpenRouter API key')) {
        return 'OpenRouter API key is required for cloud transcription. Add it in Settings → Cloud AI.';
    }
    if (msg.includes('Audio conversion failed')) {
        return 'Could not extract audio from this video. The video may be restricted or unavailable. Try a different video.';
    }
    if (msg.includes('Failed to load any model')) {
        return 'Could not load the transcription model. This may be due to insufficient memory or network issues. Try the smaller model (whisper-small) in Settings.';
    }
    return msg || 'An unexpected error occurred. Please try again.';
}

async function fetchCaptions(videoId, language, autoGenerated) {
    logDebug(`Fetching captions for language: ${language}, auto: ${autoGenerated}`);
    showCaptionProgress('Fetching captions from YouTube...', 30);
    try {
        const response = await fetch(`/api/captions/${videoId}?lang=${language}&auto=${autoGenerated}&timestamps=true`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || 'Failed to fetch captions');
        }
        showCaptionProgress('Captions received, formatting...', 80);
        return await response.text();
    } catch (error) {
        throw error;
    }
}

function formatCaptions(captions) {
    const escaped = escapeHtmlEntities(captions);
    return escaped.replace(/\[(\d{2}:\d{2}:\d{2})\]/g, (match, timestamp) => {
        return `<span class="timestamp">[${timestamp}]</span>`;
    });
}

async function fetchVideoMetadata(videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const meta = { title: 'Unknown', author: 'Unknown', description: '', thumbnail: '', url: videoUrl };

    try {
        const serverRes = await fetch(`/api/captions/video-meta/${videoId}`);
        if (serverRes.ok) {
            const serverMeta = await serverRes.json();
            if (serverMeta.title && serverMeta.title !== 'Unknown') {
                return serverMeta;
            }
        }
    } catch (e) {
        logDebug(`Server meta endpoint unavailable: ${e.message}`);
    }

    try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`);
        if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            meta.title = oembed.title || 'Unknown';
            meta.author = oembed.author_name || 'Unknown';
            meta.thumbnail = oembed.thumbnail_url || '';
        }
    } catch (e) {
        logDebug(`Failed to fetch video metadata: ${e.message}`);
    }

    return meta;
}

async function showDownloadLinks() {
    const urlInput = document.getElementById('youtubeUrl');
    const url = urlInput?.value?.trim() || '';
    let videoId = extractVideoId(url);

    if (!videoId) {
        videoId = ChatHistory.getCurrentVideoId();
    }

    if (!videoId) {
        showError(getTranslated('enterUrlFirst'));
        return;
    }

    const existing = document.getElementById('downloadModal');
    if (existing) { existing.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'downloadModal';
    modal.className = 'modal is-active';
    modal.innerHTML = `
        <div class="modal-background"></div>
        <div class="modal-card" style="width:min(95%,700px)">
            <header class="modal-card-head">
                <p class="modal-card-title">\u{1F4E5} Download Links</p>
                <button class="delete" aria-label="close" onclick="document.getElementById('downloadModal').remove()"></button>
            </header>
            <section class="modal-card-body" id="downloadModalBody">
                <p class="has-text-centered"><em>${escapeHtml(getTranslated('loadingDownloadLinks'))}</em></p>
                <progress class="progress is-small is-primary" max="100">Loading...</progress>
            </section>
            <footer class="modal-card-foot">
                <button class="button" onclick="document.getElementById('downloadModal').remove()">Close</button>
            </footer>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-background').onclick = () => modal.remove();

    try {
        const response = await fetch(`/api/captions/download-links/${videoId}`);
        if (!response.ok) throw new Error('Failed to fetch download links');
        const data = await response.json();

        const body = document.getElementById('downloadModalBody');
        if (!body) return;

        const safeTitle = sanitizeFilename(data.title || videoId);
        let html = '';
        const formats = data.videoAudio || [];

        if (formats.length === 0) {
            html = `<p class="has-text-grey">${escapeHtml(getTranslated('noDownloadFormats'))}</p>`;
        } else {
            html += '<h4 class="title is-6 mt-3">\u{1F4F9} Video + Audio</h4>';
            html += '<table class="table is-fullwidth is-narrow is-striped"><thead><tr><th>Quality</th><th>Format</th><th>Size</th><th>Note</th><th></th></tr></thead><tbody>';
            for (let i = 0; i < formats.length; i++) {
                const f = formats[i];
                const note = f.mux ? '<span class="tag is-warning is-light">Merges in browser</span>' : '<span class="tag is-success is-light">Direct</span>';
                if (f.mux) {
                    // DASH format: needs browser-side merge via ffmpeg.wasm
                    html += `<tr><td>${escapeHtml(f.quality)}</td><td>${escapeHtml(f.ext)}</td><td>${escapeHtml(f.size)}</td><td>${note}</td><td><button class="button is-small is-primary is-light mux-download-btn" data-idx="${i}"><span class="icon is-small"><i class="fas fa-download"></i></span> Download</button></td></tr>`;
                } else {
                    // Combined format: direct download
                    html += `<tr><td>${escapeHtml(f.quality)}</td><td>${escapeHtml(f.ext)}</td><td>${escapeHtml(f.size)}</td><td>${note}</td><td><a href="${f.url}" target="_blank" rel="noopener" class="button is-small is-primary is-light">Download</a></td></tr>`;
                }
            }
            html += '</tbody></table>';

            // Add a note about browser merging
            if (formats.some(f => f.mux)) {
                html += '<p class="help mt-2"><i class="fas fa-info-circle"></i> High-resolution formats require video+audio streams to be merged in your browser using ffmpeg.wasm. This may take a moment for large files.</p>';
            }
        }

        body.innerHTML = html;

        // Wire up mux download buttons
        body.querySelectorAll('.mux-download-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const idx = parseInt(btn.dataset.idx);
                const fmt = formats[idx];
                if (!fmt || !fmt.mux) return;
                btn.classList.add('is-loading');
                btn.disabled = true;
                const statusDiv = document.createElement('div');
                statusDiv.className = 'mt-2 is-size-7';
                btn.closest('tr').after(statusDiv);
                try {
                    await downloadMuxedVideo(fmt, safeTitle, statusDiv);
                } catch (err) {
                    console.error('Mux download error:', err);
                    statusDiv.innerHTML = `<span class="has-text-danger">Error: ${escapeHtml(err.message)}</span>`;
                } finally {
                    btn.classList.remove('is-loading');
                    btn.disabled = false;
                }
            });
        });
    } catch (e) {
        const body = document.getElementById('downloadModalBody');
        if (body) body.innerHTML = `<p class="has-text-danger">${escapeHtml(getTranslated('failedToLoad', { message: e.message }))}</p>`;
    }
}

function updateCaptionsUI(captions, provider, videoId) {
    const captionsContent = document.getElementById('captionsContent');
    const currentLang = Settings.get('selectedLanguage') || 'en';
    const formattedCaptions = formatCaptions(captions);
    
    if (captionsContent) {
        captionsContent.innerHTML = formattedCaptions;
        captionsContent.setAttribute('dir', /[\u0590-\u08FF]/.test(captions) ? 'rtl' : 'auto');
        captionsContent.setAttribute('data-raw-captions', captions);
        captionsContent.setAttribute('data-provider', provider);
        if (videoId) {
            captionsContent.setAttribute('data-video-id', videoId);
        }
        if (['claude', 'haiku', 'sonnet'].includes(provider) && captions.length > 12000) {
            showStatus(translations[currentLang].modelLimitNote, 'info');
        }
        showElement('captions');
    }

    const chatResponse = document.getElementById('chatResponse');
    if (chatResponse) {
        let chatMessages = chatResponse.querySelector('.chat-messages');
        if (!chatMessages) {
            chatResponse.innerHTML = '<div class="chat-messages"></div>';
            chatMessages = chatResponse.querySelector('.chat-messages');
        }
        chatMessages.innerHTML = '';
        const renderToken = `${videoId || 'no-video'}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        chatMessages.dataset.renderToken = renderToken;

        if (videoId) {
            fetchVideoMetadata(videoId).then(meta => {
                if (!chatMessages.isConnected || chatMessages.dataset.renderToken !== renderToken) return;
                const metaMessage = document.createElement('div');
                metaMessage.className = 'chat-message system-message video-context-message';
                const metaContent = document.createElement('div');
                metaContent.className = 'message-content';

                if (meta) {
                    // Only allow http/https URLs — blocks javascript: and attribute-breakout XSS
                    const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : '';
                    const thumbUrl = safeUrl(meta.thumbnail);
                    const videoUrlSafe = safeUrl(meta.url);
                    const thumbHtml = thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="Video thumbnail" style="max-width:200px;border-radius:6px;margin-bottom:0.5rem;"><br>` : '';
                    const descHtml = meta.description ? `<p style="font-size:0.9em;opacity:0.8;margin-top:0.5rem;white-space:pre-wrap;">${escapeHtml(meta.description)}</p>` : '';
                    metaContent.innerHTML = `
                        ${thumbHtml}
                        <strong>🎬 ${escapeHtml(meta.title)}</strong><br>
                        <span style="opacity:0.7;">👤 ${escapeHtml(meta.author)}</span><br>
                        <a href="${escapeHtml(videoUrlSafe)}" target="_blank" rel="noopener">${escapeHtml(videoUrlSafe)}</a>
                        ${descHtml}
                    `;

                } else {
                    metaContent.innerHTML = `<strong>🎬 Video:</strong> <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener">https://www.youtube.com/watch?v=${videoId}</a>`;
                }

                metaMessage.appendChild(metaContent);
                chatMessages.appendChild(metaMessage);

                addTranscriptionMessage(chatMessages, captions, formattedCaptions);

                window.VidChatStore?.onCaptionsReady?.({ videoId, captions, provider, meta });

                chatMessages.scrollTop = chatMessages.scrollHeight;
                showElement('chatResponse');
            });
        } else {
            addTranscriptionMessage(chatMessages, captions, formattedCaptions);
            window.VidChatStore?.onCaptionsReady?.({ videoId: null, captions, provider, meta: null });
            showElement('chatResponse');
        }
    }
}

function addTranscriptionMessage(chatMessages, rawCaptions, formattedCaptions) {
    chatMessages.querySelectorAll('.transcript-message').forEach(message => message.remove());
    const systemMessage = document.createElement('div');
    systemMessage.className = 'chat-message system-message transcript-message';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    const transcriptIsRTL = /[\u0590-\u08FF]/.test(rawCaptions);
    contentDiv.innerHTML = `<strong class="transcript-label">📝 Video Captions:</strong><div class="transcript-content" dir="${transcriptIsRTL ? 'rtl' : 'auto'}">${formattedCaptions}</div>`;
    systemMessage.appendChild(contentDiv);
    systemMessage.appendChild(createCopyButton(rawCaptions));
    chatMessages.appendChild(systemMessage);
}

// ===== Provider Auto-Detection =====
function getChatProvider() {
    const aiMode = Settings.get('aiMode') || 'local';
    const settings = Settings.load();
    const hasCloudKey = settings.openrouterApiKey && settings.openrouterApiKey.length > 5;

    if (aiMode === 'cloud' && hasCloudKey) return 'openrouter';
    if (aiMode === 'cloud' && !hasCloudKey) return 'openrouter';
    if (aiMode === 'auto' && hasCloudKey) return 'openrouter';
    if (aiMode === 'auto' && !hasCloudKey) return 'webllm';
    return 'webllm';
}

// ===== Subtitle Generation (SRT/VTT) =====

function secondsToSRTTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function secondsToVTTTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function generateSRT(segments) {
    const lines = [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        lines.push(`${i + 1}`);
        lines.push(`${secondsToSRTTime(seg.start)} --> ${secondsToSRTTime(seg.end)}`);
        lines.push(seg.text || '');
        lines.push('');
    }
    return lines.join('\n');
}

function generateVTT(segments) {
    const lines = ['WEBVTT', ''];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        lines.push(`${secondsToVTTTime(seg.start)} --> ${secondsToVTTTime(seg.end)}`);
        lines.push(seg.text || '');
        lines.push('');
    }
    return lines.join('\n');
}

/** Normalize a string to be a valid Windows filename */
function sanitizeFilename(name) {
    return (name || 'video')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')   // Remove invalid Windows chars
        .replace(/\s+/g, ' ')                       // Collapse whitespace
        .replace(/[\s.]+$/g, '')                    // Remove trailing dots/spaces
        .trim()
        .slice(0, 200) || 'video';
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    // Save the current URL — the iframe's blob navigation triggers
    // the router's popstate handler, which changes the URL.
    const savedUrl = window.location.href;
    const savedTitle = document.title;
    // Use a hidden iframe to host the download link.
    // The SPA router (router.js) intercepts ALL <a> clicks on document —
    // blob URLs get treated as navigation routes. By placing the <a> inside
    // an iframe, the click event never reaches the main document's listener.
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const a = iframeDoc.createElement('a');
    a.href = url;
    a.download = filename;
    iframeDoc.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
        // Restore the original URL — the iframe navigation may have
        // triggered the router's popstate handler and changed it.
        if (window.location.href !== savedUrl) {
            history.replaceState(null, savedTitle, savedUrl);
        }
    }, 1000);
}

/**
 * Download and merge separate DASH video+audio streams using ffmpeg.wasm.
 * This is the browser-only approach for high-resolution YouTube downloads.
 */
async function downloadMuxedVideo(fmt, safeTitle, statusDiv) {
    if (!window.Transcriber || !Transcriber.loadFFmpeg) {
        throw new Error('ffmpeg.wasm not loaded. Transcribe any audio first to load it, then try again.');
    }

    statusDiv.innerHTML = '<em>Loading ffmpeg.wasm...</em>';
    const ffmpeg = await Transcriber.loadFFmpeg();

    // Download video stream
    statusDiv.innerHTML = '<em>Downloading video stream...</em>';
    const videoResp = await fetch(fmt.videoUrl);
    if (!videoResp.ok) throw new Error(`Failed to download video stream: HTTP ${videoResp.status}`);
    const videoBuf = new Uint8Array(await videoResp.arrayBuffer());

    // Download audio stream
    statusDiv.innerHTML = '<em>Downloading audio stream...</em>';
    const audioResp = await fetch(fmt.audioUrl);
    if (!audioResp.ok) throw new Error(`Failed to download audio stream: HTTP ${audioResp.status}`);
    const audioBuf = new Uint8Array(await audioResp.arrayBuffer());

    const videoIn = `video.${fmt.videoExt || 'mp4'}`;
    const audioIn = `audio.${fmt.audioExt || 'm4a'}`;
    const outputName = `${safeTitle}.mp4`;

    statusDiv.innerHTML = '<em>Merging video + audio with ffmpeg.wasm...</em>';
    try {
        await ffmpeg.writeFile(videoIn, videoBuf);
        await ffmpeg.writeFile(audioIn, audioBuf);

        await ffmpeg.exec([
            '-i', videoIn,
            '-i', audioIn,
            '-c', 'copy',
            '-movflags', '+faststart',
            outputName
        ]);

        const outputData = await ffmpeg.readFile(outputName);

        // Clean up
        try { await ffmpeg.deleteFile(videoIn); } catch (_) {}
        try { await ffmpeg.deleteFile(audioIn); } catch (_) {}
        try { await ffmpeg.deleteFile(outputName); } catch (_) {}

        downloadFile(outputData.buffer, outputName, 'video/mp4');
        statusDiv.innerHTML = '<span class="has-text-success"><i class="fas fa-check"></i> Download complete!</span>';
    } catch (err) {
        // Clean up on error
        try { await ffmpeg.deleteFile(videoIn); } catch (_) {}
        try { await ffmpeg.deleteFile(audioIn); } catch (_) {}
        try { await ffmpeg.deleteFile(outputName); } catch (_) {}
        throw new Error(`ffmpeg merge failed: ${err.message}`);
    }
}

function injectSubtitleDownloadButtons(videoId, segments, videoTitle, langHint) {
    // Remove existing subtitle buttons if any
    const existing = document.querySelectorAll('.subtitle-download-buttons');
    existing.forEach(el => el.remove());

    // Register original language subtitles.
    // langHint: explicit language of `segments` (e.g. target language after translation).
    // Falls back to the caption dropdown for legacy callers.
    const captionLang = langHint || document.getElementById('captionLanguage')?.value || 'en';
    subtitleRegistry.register(videoId, captionLang, segments);

    // Also load any cached subtitles from localStorage into registry
    // (scan ALL cached languages, not a hardcoded list — new translation targets must survive reload)
    const cachePrefix = `subtitle_${videoId}_`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(cachePrefix)) continue;
        const lang = key.substring(cachePrefix.length);
        if (lang === captionLang) continue; // already registered above with fresher segments
        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.segments && parsed.segments.length > 0) {
                    subtitleRegistry.register(videoId, lang, parsed.segments);
                }
            }
        } catch (_) {}
    }

    // Auto-show video player and populate subtitle selector
    const playerContainer = document.getElementById('videoPlayerContainer');
    if (playerContainer && segments && segments.length > 0) {
        playerContainer.classList.remove('is-hidden');
        loadVideoInPlayer(videoId);
        populateSubtitleSelector(videoId);
        // Start subtitle sync with the original language
        setTimeout(() => startSubtitleSync(segments, captionLang), 1500);
    }

    const srtContent = generateSRT(segments);
    const vttContent = generateVTT(segments);
    if (!segments || segments.length === 0) return;

    const container = document.createElement('div');
    container.className = 'subtitle-download-buttons notification is-success is-light';
    container.style.marginTop = '1rem';
    const safeName = sanitizeFilename(videoTitle || videoId);
    container.innerHTML = `
        <p><strong>📝 Subtitles ready!</strong> ${segments.length} segments generated with precise timestamps.</p>
        <div class="buttons" style="margin-top: 0.5rem;">
            <button type="button" class="button is-small is-primary subtitle-srt-btn">
                <span class="icon is-small"><i class="fas fa-download"></i></span>
                <span>${escapeHtml(getTranslated('downloadSrt', null) || 'Download .srt')}</span>
            </button>
            <button type="button" class="button is-small is-link subtitle-vtt-btn">
                <span class="icon is-small"><i class="fas fa-download"></i></span>
                <span>${escapeHtml(getTranslated('downloadVtt', null) || 'Download .vtt')}</span>
            </button>
            <button type="button" class="button is-small is-info subtitle-retranslate-btn">
                <span class="icon is-small"><i class="fas fa-language"></i></span>
                <span>${escapeHtml(getTranslated('translateSubtitles', null) || 'Translate to...')}</span>
            </button>
        </div>
    `;

    // Insert after captions content
    const captionsDiv = document.getElementById('captionsContent');
    if (captionsDiv && captionsDiv.parentNode) {
        captionsDiv.parentNode.insertBefore(container, captionsDiv.nextSibling);
    }

    container.querySelector('.subtitle-srt-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        downloadFile(srtContent, `${safeName}.srt`, 'text/x-srt;charset=utf-8');
    };
    container.querySelector('.subtitle-vtt-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        downloadFile(vttContent, `${safeName}.vtt`, 'text/vtt;charset=utf-8');
    };

    // Wire up "Translate to..." button — re-opens Smart Subtitle Modal
    const retranslateBtn = container.querySelector('.subtitle-retranslate-btn');
    if (retranslateBtn) {
        retranslateBtn.onclick = (e) => {
            e.preventDefault();
            handleSubtitles();
        };
    }
}

/** Parse SRT text into segments array */
function parseSRT(srtText) {
    const segments = [];
    const blocks = srtText.trim().split(/\n\s*\n/);
    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;
        // Find the timestamp line (contains " --> ")
        let tsLineIdx = lines.findIndex(l => l.includes('-->'));
        if (tsLineIdx < 0) continue;
        const tsLine = lines[tsLineIdx];
        const [startStr, endStr] = tsLine.split('-->').map(s => s.trim());
        const start = parseSRTTime(startStr);
        const end = parseSRTTime(endStr);
        const text = lines.slice(tsLineIdx + 1).join('\n').trim();
        if (!isNaN(start) && !isNaN(end) && text) {
            segments.push({ start, end, text });
        }
    }
    return segments;
}

/** Parse SRT/VTT timestamp to seconds */
function parseSRTTime(str) {
    const match = str.match(/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/);
    if (!match) return NaN;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
}

// ===== Decomposed handleSubmit =====

function getEffectiveModel() {
    const aiMode = Settings.get('aiMode') || 'local';
    const settings = Settings.load();
    const cloudSttModel = Settings.get('cloudSttModel');
    const hasCloudKey = settings.openrouterApiKey && settings.openrouterApiKey.length > 5;
    
    if ((aiMode === 'cloud' || aiMode === 'auto') && hasCloudKey) {
        return cloudSttModel || 'openrouter-mai-transcribe';
    }
    return Settings.get('whisperModel') || 'whisper-medium';
}

async function handleTranscription(videoId, language, captionError) {
    if (!window.Transcriber || !Transcriber.isSupported()) {
        throw captionError;
    }

    hideElement('loading');

    const aiMode = Settings.get('aiMode') || 'local';
    const settings = Settings.load();
    const hasCloudKey = settings.openrouterApiKey && settings.openrouterApiKey.length > 5;

    let selectedTranscribeModel;

    if (aiMode === 'cloud' && hasCloudKey) {
        selectedTranscribeModel = Settings.get('cloudSttModel') || 'openrouter-whisper-large-v3';
        logDebug(`Cloud mode: using ${selectedTranscribeModel}`);
    } else if (aiMode === 'cloud' && !hasCloudKey) {
        const userChoice = await showTranscribePrompt(language);
        if (!userChoice) throw captionError;
        selectedTranscribeModel = userChoice.model || 'whisper-medium';
    } else if (aiMode === 'auto' && hasCloudKey) {
        selectedTranscribeModel = Settings.get('cloudSttModel') || 'openrouter-whisper-large-v3';
        logDebug(`Auto mode: using cloud ${selectedTranscribeModel}`);
    } else if (aiMode === 'auto' && !hasCloudKey) {
        selectedTranscribeModel = Settings.get('whisperModel') || 'whisper-medium';
        logDebug(`Auto mode: no API key, using local ${selectedTranscribeModel}`);
    } else {
        selectedTranscribeModel = Settings.get('whisperModel') || 'whisper-medium';
        logDebug(`Local mode: using ${selectedTranscribeModel}`);
    }
    
    logDebug(`Starting transcription with model: ${selectedTranscribeModel}`);
    
    showTranscribeProgress('Preparing transcription...');
    
    const onProgress = (progress) => {
        updateTranscribeProgress(progress);
        logDebug(`Transcriber: ${progress.stage} - ${progress.message || ''}`);
    };

    const onPartial = (partial) => {
        const preview = document.getElementById('transcribe-preview');
        const bar = document.getElementById('transcribe-bar');
        const detail = document.getElementById('transcribe-detail');

        if (preview && partial.chunks) {
            preview.style.display = 'block';
            preview.innerHTML = partial.chunks.map(chunk => {
                const start = chunk.timestamp?.[0] || 0;
                const h = Math.floor(start / 3600);
                const m = Math.floor((start % 3600) / 60);
                const s = Math.floor(start % 60);
                const ts = `[${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}]`;
                return `<p style="margin:0;"><span class="timestamp">${ts}</span> ${escapeHtml(chunk.text.trim())}</p>`;

            }).join('');
            preview.scrollTop = preview.scrollHeight;
        }

        if (bar && partial.progress !== undefined) {
            bar.value = partial.progress;
            bar.textContent = `${partial.progress}%`;
        }
        if (detail) {
            detail.textContent = `${partial.chunks?.length || 0} segments transcribed`;
        }
    };
    
    try {
        const captionsText = await Transcriber.transcribe(
            videoId,
            language,
            selectedTranscribeModel,
            onProgress,
            onPartial
        );
        
        try {
            const cacheKey = `transcript_${videoId}_${language}_${selectedTranscribeModel}`;
            localStorage.setItem(cacheKey, captionsText);
            logDebug(`Cached transcript for ${videoId} (model: ${selectedTranscribeModel})`);
        } catch (e) {
            logDebug(`Failed to cache transcript: ${e.message}`);
        }
        logDebug(`Browser transcription complete, length: ${captionsText.length} characters`);
        
        hideTranscribeProgress();
        return captionsText;
    } catch (transcribeError) {
        if (transcribeError.name === 'AbortError') {
            showStatus(getTranslated('transcriptionCancelled'), 'info');
            hideTranscribeProgress();
            disableButton('submitBtn', false);
            return null;
        }
        throw transcribeError;
    }
}

// ===== Smart Subtitle Modal =====

const TARGET_LANGUAGES = [
    { name: 'Afrikaans' }, { name: 'Albanian' }, { name: 'Amharic' },
    { name: 'Arabic', native: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' }, { name: 'Armenian' },
    { name: 'Azerbaijani' }, { name: 'Basque' }, { name: 'Belarusian' },
    { name: 'Bengali' }, { name: 'Bosnian' },
    { name: 'Bulgarian' }, { name: 'Burmese' },
    { name: 'Catalan' }, { name: 'Chinese', native: '\u4e2d\u6587' },
    { name: 'Croatian' }, { name: 'Czech' },
    { name: 'Danish' }, { name: 'Dutch' },
    { name: 'English' }, { name: 'Esperanto' }, { name: 'Estonian' },
    { name: 'Farsi', native: '\u0641\u0627\u0631\u0633\u06cc' }, { name: 'Filipino' },
    { name: 'Finnish' }, { name: 'French' },
    { name: 'Galician' }, { name: 'Georgian' },
    { name: 'German' }, { name: 'Greek' },
    { name: 'Gujarati' }, { name: 'Haitian Creole' }, { name: 'Hausa' },
    { name: 'Hebrew' }, { name: 'Hindi' },
    { name: 'Hungarian' }, { name: 'Icelandic' },
    { name: 'Indonesian' }, { name: 'Irish' }, { name: 'Italian' },
    { name: 'Japanese' }, { name: 'Javanese' },
    { name: 'Kannada' }, { name: 'Kazakh' }, { name: 'Khmer' },
    { name: 'Korean' }, { name: 'Kurdish' },
    { name: 'Kyrgyz' }, { name: 'Lao' }, { name: 'Latin' },
    { name: 'Latvian' }, { name: 'Lithuanian' }, { name: 'Luxembourgish' },
    { name: 'Macedonian' }, { name: 'Malagasy' }, { name: 'Malay' },
    { name: 'Malayalam' }, { name: 'Maltese' }, { name: 'Maori' },
    { name: 'Marathi' }, { name: 'Mongolian' }, { name: 'Nepali' },
    { name: 'Norwegian' }, { name: 'Pashto' }, { name: 'Polish' },
    { name: 'Portuguese' }, { name: 'Punjabi' },
    { name: 'Romanian' }, { name: 'Russian' },
    { name: 'Scottish Gaelic' }, { name: 'Serbian' },
    { name: 'Sinhala' }, { name: 'Slovak' }, { name: 'Slovenian' },
    { name: 'Somali' }, { name: 'Spanish' },
    { name: 'Sundanese' }, { name: 'Swahili' }, { name: 'Swedish' },
    { name: 'Tagalog' }, { name: 'Tajik' }, { name: 'Tamil' },
    { name: 'Telugu' }, { name: 'Thai' },
    { name: 'Turkish' }, { name: 'Turkmen' },
    { name: 'Ukrainian' }, { name: 'Urdu', native: '\u0627\u0631\u062f\u0648' },
    { name: 'Uyghur' }, { name: 'Uzbek' }, { name: 'Vietnamese' },
    { name: 'Welsh' }, { name: 'Yiddish' }, { name: 'Yoruba' }, { name: 'Zulu' },
];

/** Map ISO 639-1 codes → simple English names (for comparing YouTube track codes with target names) */
const LANG_CODE_TO_NAME = {
    ar: 'Arabic', en: 'English', es: 'Spanish', fr: 'French', fa: 'Farsi',
    de: 'German', hi: 'Hindi', id: 'Indonesian', it: 'Italian', ja: 'Japanese',
    ko: 'Korean', ms: 'Malay', pt: 'Portuguese', ru: 'Russian', th: 'Thai',
    tr: 'Turkish', vi: 'Vietnamese', zh: 'Chinese', ku: 'Kurdish', ur: 'Urdu',
    nl: 'Dutch', pl: 'Polish', sv: 'Swedish', uk: 'Ukrainian', he: 'Hebrew',
    bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', gu: 'Gujarati',
    kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', sw: 'Swahili', tl: 'Tagalog',
    fil: 'Filipino', ps: 'Pashto', hy: 'Armenian', az: 'Azerbaijani',
    eu: 'Basque', be: 'Belarusian', bs: 'Bosnian', bg: 'Bulgarian', my: 'Burmese',
    ca: 'Catalan', hr: 'Croatian', cs: 'Czech', da: 'Danish', et: 'Estonian',
    fi: 'Finnish', gl: 'Galician', ka: 'Georgian', el: 'Greek', ht: 'Haitian Creole',
    ha: 'Hausa', hu: 'Hungarian', is: 'Icelandic', ga: 'Irish', jv: 'Javanese',
    kk: 'Kazakh', km: 'Khmer', ky: 'Kyrgyz', lo: 'Lao', la: 'Latin',
    lv: 'Latvian', lt: 'Lithuanian', lb: 'Luxembourgish', mk: 'Macedonian',
    mg: 'Malagasy', mt: 'Maltese', mi: 'Maori', mn: 'Mongolian', ne: 'Nepali',
    no: 'Norwegian', ro: 'Romanian', sr: 'Serbian', si: 'Sinhala', sk: 'Slovak',
    sl: 'Slovenian', so: 'Somali', su: 'Sundanese', tg: 'Tajik', tt: 'Tatar',
    tk: 'Turkmen', ug: 'Uyghur', uz: 'Uzbek', cy: 'Welsh', yi: 'Yiddish',
    yo: 'Yoruba', zu: 'Zulu', am: 'Amharic', eo: 'Esperanto', haw: 'Hawaiian',
    ceb: 'Cebuano', hmn: 'Hmong',
};

/** Check if a language (code or name) matches the target language name */
function langMatchesTarget(codeOrName, targetName) {
    if (!codeOrName || !targetName) return false;
    if (codeOrName === targetName) return true;
    if (LANG_CODE_TO_NAME[codeOrName] === targetName) return true;
    return false;
}

function scanCachedSubtitles(videoId) {
    const prefix = `subtitle_${videoId}_`;
    const cached = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        try {
            const lang = key.substring(prefix.length);
            const parsed = JSON.parse(localStorage.getItem(key));
            if (parsed.segments && parsed.segments.length > 0) {
                cached.push({
                    lang, segments: parsed.segments, text: parsed.text || '',
                    origin: parsed.translatedFrom ? 'translated' : 'transcribed',
                    translatedFrom: parsed.translatedFrom || null,
                    model: parsed.model || null, timestamp: parsed.timestamp || 0,
                });
            }
        } catch (_) {}
    }
    return cached;
}

async function handleSubtitles() {
    const urlInput = document.getElementById('youtubeUrl');
    const currentLang = Settings.get('selectedLanguage') || 'en';
    const t = (key, replacements) => {
        let result = translations[currentLang]?.status?.[key] || translations['en']?.status?.[key] || key;
        if (replacements) {
            for (const [k, v] of Object.entries(replacements)) {
                result = result.replace(`{${k}}`, v);
            }
        }
        return result;
    };

    hideElement('error'); hideElement('status'); hideElement('loading');

    const url = urlInput?.value.trim() || '';
    if (!url) { showError(translations[currentLang].errors.enterUrl); return; }
    const videoId = extractVideoId(url);
    if (!videoId) { showError(translations[currentLang].errors.invalidUrl); return; }

    document.getElementById('smartSubModal')?.remove();

    const cachedSubs = scanCachedSubtitles(videoId);
    const cachedLangs = cachedSubs.map(c => c.lang);

    // ─── P2P: Initialize room if enabled ────────────────────
    let peerSubsForVideo = {};
    if (Settings.get('p2pEnabled') && window.P2P) {
        const roomMode = Settings.get('p2pRoomMode') || 'public';
        const customRoom = Settings.get('p2pCustomRoom') || '';
        const roomId = roomMode === 'custom' && customRoom ? customRoom : null;
        // Check URL param for p2p_room (from QR code link)
        const urlParam = new URLSearchParams(window.location.search).get('p2p_room');
        const joinRoomId = urlParam || roomId;
        P2P.init(joinRoomId, {
            onPeerUpdate: (count) => {
                const badge = document.getElementById('p2pPeerBadge');
                if (badge) {
                    const dot = badge.querySelector('.p2p-badge-dot');
                    if (dot) { dot.className = `p2p-badge-dot ${count > 0 ? 'connected' : 'connecting'}`; }
                    const countText = badge.querySelector('.p2p-count-text');
                    if (countText) countText.textContent = count > 0 ? t('p2pPeersOnline', { count }) : t('p2pNoPeers');
                }
            }
        });
        P2P.broadcastIndex();
        peerSubsForVideo = P2P.getPeerSubsForVideo(videoId);
    }

    // Show modal immediately with spinner, then populate after fetch
    const savedTargetEarly = Settings.get('subtitleTargetLang') || 'English';
    const recentLangsEarly = Settings.get('recentTargetLangs') || [];
    const earlyModal = document.createElement('div');
    earlyModal.id = 'smartSubModal';
    earlyModal.className = 'modal is-active';
    const langOptsHtml = TARGET_LANGUAGES.map(l => `<option value="${escapeHtml(l.name)}" label="${escapeHtml(l.native ? l.name + ' / ' + l.native : l.name)}"></option>`).join('');
    const recentHtmlEarly = recentLangsEarly.length > 0 ? `<div style="margin-top:0.3rem;display:flex;flex-wrap:wrap;gap:0.3rem;">${recentLangsEarly.map(l => `<button type="button" class="button is-small is-info is-light is-rounded smart-sub-recent-chip" data-lang="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('')}</div>` : '';
    const cachedInfoEarly = cachedLangs.length > 0 ? `<p style="font-size:0.85em;margin-top:0.3rem;color:#363636;">${t('smartSubCachedOnDevice')} <strong>${cachedLangs.join(', ')}</strong></p>` : '';
    earlyModal.innerHTML = `<div class="modal-background"></div><div class="modal-card" style="max-width:600px;"><header class="modal-card-head"><p class="modal-card-title">\ud83d\udcdd ${t('smartSubTitle')}</p><button class="delete" aria-label="close"></button></header><section class="modal-card-body"><p style="margin-bottom:0.75rem;" id="smartSubTitle"><strong>\ud83c\udfac ${escapeHtml(videoId)}</strong></p><p id="smartSubSpokenLine" style="display:none;font-size:0.9em;margin-bottom:0.75rem;"></p><div class="field"><label class="label">${t('smartSubTarget')}</label><div class="control"><input type="text" id="smartSubTargetInput" class="input" list="smartSubLangList" value="${escapeHtml(savedTargetEarly)}" placeholder="${t('smartSubTypeToFilter')}"><datalist id="smartSubLangList">${langOptsHtml}</datalist></div>${recentHtmlEarly}</div>${cachedInfoEarly}<div class="field" style="margin-top:0.75rem;"><label class="label">${t('smartSubSources')}</label><div id="smartSubSourceList" style="max-height:240px;overflow-y:auto;border:1px solid #dbdbdb;border-radius:4px;padding:0.5rem;"><div class="smart-sub-spinner">${t('smartSubLoading')}</div></div></div><p id="smartSubHint" style="margin-top:0.5rem;font-size:0.9em;color:#363636;"></p></section><footer class="modal-card-foot" style="justify-content:flex-end;"><button class="button" id="smartSubCancel">${t('close')}</button><button class="button is-primary" id="smartSubGo">${t('smartSubGet')}</button></footer></div>`;
    document.body.appendChild(earlyModal);
    const closeModalEarly = () => { earlyModal.remove(); };
    earlyModal.querySelector('#smartSubCancel').onclick = closeModalEarly;
    earlyModal.querySelector('.delete').onclick = closeModalEarly;
    earlyModal.querySelector('.modal-background').onclick = closeModalEarly;

    // Fetch available tracks (modal already visible with spinner)
    let availableData = { title: null, spoken: null, manual: [], auto: [], error: null };
    try {
        disableButton('subtitleBtn', true);
        const resp = await fetch(`/api/captions/available/${videoId}`);
        if (resp.ok) availableData = await resp.json();
    } catch (e) { logDebug(`Failed to fetch available subs: ${e.message}`); }
    finally { disableButton('subtitleBtn', false); }

    const spoken = availableData.spoken || null;

    // Get video title — try availableData first, then fallback to oEmbed
    let videoTitle = availableData.title;
    if (!videoTitle || videoTitle === 'Unknown') {
        try { const meta = await fetchVideoMetadata(videoId); videoTitle = meta?.title || videoId; } catch (_) { videoTitle = videoId; }
    }

    // Update modal title + spoken language now that we have data
    const titleEl = earlyModal.querySelector('#smartSubTitle');
    if (titleEl) titleEl.innerHTML = `<strong>\ud83c\udfac ${escapeHtml(videoTitle)}</strong>`;
    if (spoken) { const sp = earlyModal.querySelector('#smartSubSpokenLine'); if (sp) { sp.innerHTML = `\ud83d\udd0a ${t('smartSubSpoken')}: <strong>${escapeHtml(spoken)}</strong>`; sp.style.display = ''; } }

    const sources = [];
    for (const track of availableData.manual) {
        sources.push({ type: 'youtube', lang: track.lang, label: track.label, auto: false });
    }
    for (const track of availableData.auto) {
        sources.push({ type: 'youtube', lang: track.lang, label: track.label, auto: true });
    }
    for (const c of cachedSubs) {
        sources.push({ type: 'cached', lang: c.lang, segments: c.segments, text: c.text, origin: c.origin, translatedFrom: c.translatedFrom });
    }
    // Add P2P peer sources if available
    const peerSubKeys = Object.keys(peerSubsForVideo);
    if (peerSubKeys.length > 0) {
        for (const lang of peerSubKeys) {
            const peerInfo = peerSubsForVideo[lang];
            sources.push({ type: 'p2p', lang, count: peerInfo.count, source: peerInfo.source, peerCount: peerInfo.peers.length });
        }
    }

    sources.push({ type: 'transcribe' });

    // Build source list HTML to replace the spinner
    let sourcesHtml = '';
    for (const src of sources) {
        if (src.type === 'transcribe') {
            sourcesHtml += `<hr style="margin:0.75rem 0;"><label class="radio" style="display:block;padding:0.4rem 0;"><input type="radio" name="smartSubSource" value="transcribe"><strong>\ud83c\udfa4 ${t('smartSubTranscribe')}</strong> <span style="font-size:0.8em;color:#7a7a7a;margin-left:0.3rem;">${t('smartSubTranscribeCost')}</span></label>`;
        } else if (src.type === 'p2p') {
            sourcesHtml += `<div class="p2p-source-item"><input type="radio" name="smartSubSource" value="p2p:${escapeHtml(src.lang)}"><span class="p2p-icon">\ud83d\udc65</span><strong>${escapeHtml(src.lang)}</strong>\u2014${src.count} segments <span class="peer-count">${src.peerCount} peer(s)</span></div>`;
        } else {
            const isCached = src.type === 'cached';
            const tag = isCached ? `<span class="tag is-warning is-light is-small">${t('smartSubCached')}</span>` : `<span class="tag is-${src.auto ? 'info' : 'success'} is-light is-small">${src.auto ? t('smartSubAuto') : t('smartSubOfficial')}</span>`;
            const originTag = isCached && src.origin ? ` <span class="tag is-light is-small">${t(src.origin === 'translated' ? 'smartSubTranslated' : 'smartSubTranscribed')}${src.translatedFrom ? ' \u00b7 ' + escapeHtml(src.translatedFrom) : ''}</span>` : '';
            const segCount = isCached ? ` (${src.segments.length} seg)` : '';
            const srcId = `cached:${src.lang}`;
            const srcVal = isCached ? srcId : `youtube:${src.lang}`;
            sourcesHtml += `<label class="radio" style="display:block;padding:0.4rem 0;"><input type="radio" name="smartSubSource" value="${escapeHtml(srcVal)}"><strong>${escapeHtml(src.lang)}</strong> \u2014 ${escapeHtml(src.label || src.lang)} ${tag}${originTag}<span style="font-size:0.8em;color:#7a7a7a;">${segCount}</span></label>`;
        }
    }

    // Replace spinner in earlyModal with actual source list
    const sourceListEl = earlyModal.querySelector('#smartSubSourceList');
    if (sourceListEl) sourceListEl.innerHTML = sourcesHtml;

    const modal = earlyModal; // alias for consistency with rest of code
    const targetInput = modal.querySelector('#smartSubTargetInput');
    const hintEl = modal.querySelector('#smartSubHint');
    const goBtn = modal.querySelector('#smartSubGo');
    const closeModal = () => { modal.remove(); };

    modal.querySelectorAll('.smart-sub-recent-chip').forEach(chip => {
        chip.onclick = (e) => { e.preventDefault(); targetInput.value = chip.dataset.lang; updateHint(); };
    });

    function getDefaultSource() {
        const target = targetInput.value.trim();
        for (const src of sources) { if (src.type !== 'transcribe' && langMatchesTarget(src.lang, target) && src.type === 'youtube' && !src.auto) return src; }
        for (const src of sources) { if (src.type !== 'transcribe' && langMatchesTarget(src.lang, target) && src.type === 'youtube') return src; }
        for (const src of sources) { if (src.type !== 'transcribe' && langMatchesTarget(src.lang, target)) return src; }
        for (const src of sources) { if (src.type !== 'transcribe') return src; }
        return sources[sources.length - 1];
    }

    const defaultSrc = getDefaultSource();
    if (defaultSrc) {
        const defaultVal = defaultSrc.type === 'transcribe' ? 'transcribe' : `${defaultSrc.type}:${defaultSrc.lang}`;
        const radio = modal.querySelector(`input[name="smartSubSource"][value="${defaultVal}"]`);
        if (radio) radio.checked = true;
    }

    function updateHint() {
        const target = targetInput.value.trim();
        const checkedRadio = modal.querySelector('input[name="smartSubSource"]:checked');
        if (!checkedRadio) { hintEl.textContent = ''; return; }
        const srcVal = checkedRadio.value;
        if (srcVal === 'transcribe') { hintEl.textContent = t('smartSubTranscribeHint'); return; }
        const isCachedSrc = srcVal.startsWith('cached:');
        const srcLang = srcVal.replace(/^(cached|youtube):/, '');
        if (isCachedSrc) {
            if (langMatchesTarget(srcLang, target)) { hintEl.textContent = t('smartSubFromCached'); }
            else { hintEl.textContent = t('smartSubWillTranslate', { source: srcLang, target }); }
            return;
        }
        if (langMatchesTarget(srcLang, target)) { hintEl.textContent = t('smartSubWillLoadDirect', { lang: srcLang }); }
        else { hintEl.textContent = t('smartSubWillTranslate', { source: srcLang, target }); }
    }

    targetInput.addEventListener('input', updateHint);
    modal.querySelectorAll('input[name="smartSubSource"]').forEach(r => r.addEventListener('change', updateHint));
    updateHint();

    goBtn.onclick = async () => {
        const targetLang = targetInput.value.trim();
        if (!targetLang) return;
        const checkedRadio = modal.querySelector('input[name="smartSubSource"]:checked');
        if (!checkedRadio) return;
        const srcVal = checkedRadio.value;

        Settings.set('subtitleTargetLang', targetLang);
        let recent = Settings.get('recentTargetLangs') || [];
        recent = [targetLang, ...recent.filter(l => l !== targetLang)].slice(0, 5);
        Settings.set('recentTargetLangs', recent);

        closeModal();
        try {
            disableButton('subtitleBtn', true);
            showElement('loading');
            let captionText = '', segments = [], sourceLabel = '';

            if (srcVal === 'transcribe') {
                setElementText('loading', t('smartSubTranscribing'));
                const captionLanguage = document.getElementById('captionLanguage');
                const selectedLanguage = captionLanguage?.value || 'en';
                const transcribedText = await handleTranscription(videoId, selectedLanguage, new Error('No captions'));
                if (!transcribedText) return;
                captionText = transcribedText;
                if (captionText.match(/^\[\d{2}:\d{2}:\d{2}\]/m)) {
                    segments = parseCaptionTextToSegments(captionText);
                } else {
                    segments = [{ start: 0, end: Math.max(3, captionText.split(/\s+/).length * 0.5), text: captionText }];
                }
                // The transcription language is the spoken language the user picked
                // (or the detected spoken language as fallback)
                sourceLabel = LANG_CODE_TO_NAME[selectedLanguage] || LANG_CODE_TO_NAME[spoken] || selectedLanguage;
            } else if (srcVal.startsWith('cached:')) {
                const srcLang = srcVal.replace('cached:', '');
                const cachedEntry = cachedSubs.find(c => c.lang === srcLang);
                if (!cachedEntry) throw new Error('Cached subtitle not found');
                captionText = cachedEntry.text || cachedEntry.segments.map(s => s.text).join('\n');
                segments = cachedEntry.segments;
                sourceLabel = srcLang;
            } else if (srcVal.startsWith('p2p:')) {
                const srcLang = srcVal.replace('p2p:', '');
                const peersWith = P2P.findPeersWith(videoId, srcLang);
                if (peersWith.length === 0) throw new Error('No peers available with these subtitles');
                setElementText('loading', t('p2pReceiving'));
                // Request from the first available peer and wait for response
                const received = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error(t('p2pRequestFailed'))), 15000);
                    const handler = (e) => {
                        if (e.detail.videoId === videoId && e.detail.lang === srcLang) {
                            clearTimeout(timeout);
                            document.removeEventListener('p2pSubtitleReceived', handler);
                            resolve(e.detail.segments);
                        }
                    };
                    document.addEventListener('p2pSubtitleReceived', handler);
                    P2P.requestSubtitle(peersWith[0].peerId, videoId, srcLang);
                });
                segments = received;
                captionText = segments.map(s => s.text).join('\n');
                sourceLabel = srcLang;
                // Cache the received subtitles locally
                try { localStorage.setItem(`subtitle_${videoId}_${srcLang}`, JSON.stringify({ text: captionText, segments, timestamp: Date.now(), source: 'p2p' })); } catch (_) {}
                P2P.broadcastIndex(); // Update our index so peers know we have it
            } else {
                const srcLang = srcVal.replace('youtube:', '');
                setElementText('loading', `Fetching ${srcLang} captions from YouTube...`);
                // Try requested language first, then fall back to spoken language
                let response = await fetch(`/api/captions/${videoId}?lang=${srcLang}&auto=true&timestamps=true`);
                if (!response.ok && spoken && spoken !== srcLang) {
                    console.log(`[SmartSub] ${srcLang} captions not found, trying spoken language: ${spoken}`);
                    setElementText('loading', `Fetching ${spoken} captions from YouTube...`);
                    response = await fetch(`/api/captions/${videoId}?lang=${spoken}&auto=true&timestamps=true`);
                }
                if (!response.ok) {
                    const availLangs = availableData.manual?.map(t => t.lang).concat(availableData.auto?.map(t => t.lang) || []) || [];
                    const hint = availLangs.length > 0 ? ` Available: ${availLangs.join(', ')}` : '';
                    throw new Error(`No ${srcLang} captions found on YouTube.${hint}`);
                }
                captionText = await response.text();
                if (!captionText || captionText.trim().length === 0) throw new Error('Empty caption response');
                segments = parseCaptionTextToSegments(captionText);
                if (segments.length === 0) throw new Error('No caption segments parsed');
                sourceLabel = srcLang;
                try { localStorage.setItem(`subtitle_${videoId}_${srcLang}`, JSON.stringify({ text: captionText, segments, timestamp: Date.now() })); } catch (_) {}
            }

            updateCaptionsUI(captionText, 'smart-sub', videoId);

            const srcLangForComparison = srcVal === 'transcribe'
                ? sourceLabel
                : (srcVal.startsWith('cached:') ? srcVal.replace('cached:', '') : (srcVal.startsWith('youtube:') ? srcVal.replace('youtube:', '') : ''));
            if (srcLangForComparison && !langMatchesTarget(srcLangForComparison, targetLang) && segments.length > 0) {
                setElementText('loading', `Translating from ${srcLangForComparison} to ${targetLang}...`);
                const translatedSegments = await translateSegments(videoId, segments, srcLangForComparison, targetLang);
                if (translatedSegments) {
                    updateCaptionsUI(translatedSegments.map(s => s.text).join('\n'), 'smart-sub-translated', videoId);
                    injectSubtitleDownloadButtons(videoId, translatedSegments, videoTitle, targetLang);
                    showStatus(t('translationComplete', { language: targetLang }), 'success');
                } else {
                    injectSubtitleDownloadButtons(videoId, segments, videoTitle, srcLangForComparison);
                }
            } else {
                injectSubtitleDownloadButtons(videoId, segments, videoTitle, langMatchesTarget(srcLangForComparison, targetLang) ? targetLang : srcLangForComparison);
                showStatus(t('subtitlesGenerated', { count: segments.length }), 'success');
            }
        } catch (error) {
            console.error('[SmartSub] Error:', error.message);
            showError(error.message);
        } finally {
            disableButton('subtitleBtn', false);
            hideElement('loading');
        }
    };
}

async function translateSegments(videoId, segments, sourceLang, targetLang) {
    const settings = Settings.load();
    const apiKey = settings.openrouterApiKey;
    if (!apiKey || apiKey.length < 5) {
        showError(getTranslated('apiKeyRequired') || 'OpenRouter API key required. Add it in Settings.');
        return null;
    }
    const translationModel = settings.translationModel || 'deepseek/deepseek-v4-flash';
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
    const storyContext = generateSRT(segments);
    const allTranslatedSegments = [];

    logDebug(`Translating ${segments.length} segments in ${totalBatches} batches: ${sourceLang} -> ${targetLang}`);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const batchStart = batchIdx * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, segments.length);
        const batchSegments = segments.slice(batchStart, batchEnd);
        const batchSrtLines = [];
        for (let i = 0; i < batchSegments.length; i++) {
            const seg = batchSegments[i];
            batchSrtLines.push(`${batchStart + i + 1}`, `${secondsToSRTTime(seg.start)} --> ${secondsToSRTTime(seg.end)}`, seg.text || '', '');
        }
        setElementText('loading', `Translating (${batchIdx + 1}/${totalBatches})...`);
        await new Promise(r => setTimeout(r, 0));

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ text: batchSrtLines.join('\n'), targetLanguage: targetLang, model: translationModel, context: storyContext }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Translation failed' }));
            throw new Error(`Batch ${batchIdx + 1}: ${err.error || `HTTP ${response.status}`}`);
        }
        const data = await response.json();
        const batchTranslated = parseSRT(data.translated);
        if (batchTranslated.length === 0) throw new Error(`Batch ${batchIdx + 1}: No valid segments.`);
        allTranslatedSegments.push(...batchTranslated);
    }

    for (let i = 0; i < allTranslatedSegments.length; i++) allTranslatedSegments[i].sequence = i + 1;
    subtitleRegistry.register(videoId, targetLang, allTranslatedSegments);
    populateSubtitleSelector(videoId);

    try {
        localStorage.setItem(`subtitle_${videoId}_${targetLang}`, JSON.stringify({
            text: allTranslatedSegments.map(s => s.text).join('\n'), segments: allTranslatedSegments,
            timestamp: Date.now(), translatedFrom: sourceLang, model: translationModel,
        }));
    } catch (_) {}

    return allTranslatedSegments;
}

/** Parse [HH:MM:SS] caption text into SRT-compatible segments */
function parseCaptionTextToSegments(text) {
    const segments = [];
    const lines = text.split('\n');
    for (const line of lines) {
        const match = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\]\s*(.+)$/);
        if (match) {
            const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
            const textContent = match[4].trim();
            if (textContent) {
                segments.push({ start, end: start + 3, text: textContent }); // placeholder end=+3s
            }
        }
    }
    // Fix end times: each segment ends when the next one starts
    for (let i = 0; i < segments.length - 1; i++) {
        segments[i].end = segments[i + 1].start;
    }
    // Last segment: estimate 3s duration
    if (segments.length > 0) {
        const last = segments[segments.length - 1];
        last.end = last.start + Math.max(3, last.text.split(/\s+/).length * 0.5);
    }
    return segments;
}

async function handleSubmit() {
    const urlInput = document.getElementById('youtubeUrl');
    const allowAutoGenerated = document.getElementById('allowAutoGenerated');
    const languageSelect = document.getElementById('languageSelect');
    const captionLanguage = document.getElementById('captionLanguage');
    const currentLang = languageSelect?.value || 'en';
    
    hideElement('error');
    hideElement('status');
    hideElement('captions');
    hideElement('loading');
    hideCaptionProgress();
    
    const url = urlInput?.value.trim() || '';
    const selectedLanguage = captionLanguage?.value || 'en';
    const selectedProvider = getChatProvider();
    
    logDebug('Starting submission process');
    logDebug(`Selected UI language: ${currentLang}`);
    logDebug(`Selected caption language: ${selectedLanguage}`);
    logDebug(`Selected provider: ${selectedProvider}`);
    logDebug(`Allow auto-generated: ${allowAutoGenerated?.checked}`);
    
    if (!url) {
        showError(translations[currentLang].errors.enterUrl);
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        showError(translations[currentLang].errors.invalidUrl);
        return;
    }

    logDebug(`Video ID extracted: ${videoId}`);

    try {
        disableButton('submitBtn', true);
        setElementText('loading', translations[currentLang].processingCaptions);
        showElement('loading');
        
        let captions;
        let isTranscribed = false;

        const effectiveModel = getEffectiveModel();
        const transcriptCacheKey = `transcript_${videoId}_${selectedLanguage}_${effectiveModel}`;
        const cachedTranscript = localStorage.getItem(transcriptCacheKey);
        
        if (cachedTranscript) {
            captions = cachedTranscript;
            isTranscribed = true;
            showCaptionProgress('Loaded cached transcript', 100);
            logDebug(`Loaded cached transcript for ${videoId} (model: ${effectiveModel}, ${captions.length} chars)`);
            setTimeout(() => hideCaptionProgress(), 500);
        } else {
            try {
                captions = await fetchCaptions(videoId, selectedLanguage, allowAutoGenerated?.checked || false);
                logDebug(`Captions fetched, length: ${captions.length} characters`);
                hideCaptionProgress();
            } catch (captionError) {
                logDebug(`Captions failed: ${captionError.message}`);
                hideCaptionProgress();
                
                const isNoCaptions = captionError.message.includes('no captions available') ||
                                     captionError.message.includes('does not have any captions') ||
                                     captionError.message.includes('Failed to fetch captions');
                
                if (isNoCaptions && window.Transcriber && Transcriber.isSupported()) {
                    captions = await handleTranscription(videoId, selectedLanguage, captionError);
                    if (captions === null) {
                        return;
                    }
                    isTranscribed = true;
                } else {
                    showRetryOption(getFriendlyErrorMessage(captionError), () => handleSubmit());
                    throw captionError;
                }
            }
        }

        if (!captions || captions.length === 0) {
            throw new Error(translations[currentLang].errors.noCaptions);
        }

        updateCaptionsUI(captions, selectedProvider, videoId);
        
        if (isTranscribed) {
            const usedCloud = effectiveModel && effectiveModel.startsWith('openrouter-');
            if (usedCloud) {
                showStatus(getTranslated('transcribedCloud'), 'success');
            } else {
                showStatus(getTranslated('transcribedLocal'), 'success');
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
        hideTranscribeProgress();
        hideCaptionProgress();
        showError(getFriendlyErrorMessage(error));
    } finally {
        disableButton('submitBtn', false);
        hideElement('loading');
    }
}

function createCopyButton(text) {
    const button = document.createElement('button');
    button.className = 'button is-small is-light is-pulled-right copy-btn';
    button.innerHTML = `
        <span class="icon is-small">
            <i class="fas fa-copy"></i>
        </span>
    `;
    button.onclick = (e) => {
        e.stopPropagation();
        copyText(text);
    };
    return button;
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showStatus(getTranslated('copiedToClipboard'), 'success');
    }).catch(() => {
        showError(getTranslated('failedToCopy'));
    });
}

// ===== Language Name Mapping =====
const LANGUAGE_DISPLAY_NAMES = {
    'ar': 'Arabic / العربية', 'en': 'English', 'es': 'Spanish / Español',
    'fr': 'French / Français', 'fa': 'Farsi / فارسی', 'de': 'German / Deutsch',
    'hi': 'Hindi / हिन्दी', 'id': 'Indonesian', 'it': 'Italian / Italiano',
    'ja': 'Japanese / 日本語', 'ko': 'Korean / 한국어', 'ms': 'Malay',
    'pt': 'Portuguese / Português', 'ru': 'Russian / Русский',
    'th': 'Thai', 'tr': 'Turkish / Türkçe', 'vi': 'Vietnamese', 'zh': 'Chinese / 中文',
    'Arabic': 'Arabic / العربية', 'English': 'English', 'Spanish': 'Spanish / Español',
    'French': 'French / Français', 'Farsi': 'Farsi / فارسی', 'German': 'German / Deutsch',
    'Hindi': 'Hindi / हिन्दी', 'Indonesian': 'Indonesian', 'Italian': 'Italian / Italiano',
    'Japanese': 'Japanese / 日本語', 'Korean': 'Korean / 한국어', 'Portuguese': 'Portuguese / Português',
    'Russian': 'Russian / Русский', 'Turkish': 'Turkish / Türkçe', 'Chinese': 'Chinese / 中文',
};

function getLanguageDisplayName(lang) {
    return LANGUAGE_DISPLAY_NAMES[lang] || lang;
}

// ===== Subtitle Registry (tracks available subtitles per video) =====
const subtitleRegistry = {
    _subs: {}, // { videoId: { 'en': segments, 'Arabic': segments, ... } }

    register(videoId, language, segments) {
        if (!videoId || !segments || !segments.length) return;
        if (!this._subs[videoId]) this._subs[videoId] = {};
        this._subs[videoId][language] = segments;
        console.log(`[SubtitleRegistry] Registered "${language}" for ${videoId} (${segments.length} segments)`);
    },

    get(videoId, language) {
        return this._subs[videoId]?.[language] || null;
    },

    getLanguages(videoId) {
        return Object.keys(this._subs[videoId] || {});
    },

    clear(videoId) {
        delete this._subs[videoId];
    },

    clearAll() {
        this._subs = {};
    }
};

function populateSubtitleSelector(videoId) {
    const select = document.getElementById('subtitleLangSelect');
    if (!select) {
        console.warn('[SubtitleSelector] #subtitleLangSelect not found');
        return;
    }

    const languages = subtitleRegistry.getLanguages(videoId);
    const currentValue = select.value;

    console.log(`[SubtitleSelector] Populating with ${languages.length} languages:`, languages);

    select.innerHTML = '<option value="">No subtitles</option>';
    for (const lang of languages) {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = getLanguageDisplayName(lang);
        select.appendChild(opt);
    }

    // Restore previous selection or default to first available
    if (languages.includes(currentValue)) {
        select.value = currentValue;
    } else if (languages.length > 0) {
        select.value = languages[0];
    }
}

// ===== Video Player with Subtitle Overlay =====
let ytPlayer = null;
let ytApiReady = false;
let subtitleSyncInterval = null;
let currentSubtitleSegments = [];
let subtitlesVisible = true;

function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
        ytApiReady = true;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        // Set global callback
        window.onYouTubeIframeAPIReady = () => {
            ytApiReady = true;
            resolve();
        };
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
    });
}

function loadVideoInPlayer(videoId) {
    const container = document.getElementById('videoPlayerContainer');
    if (!container) return;

    container.classList.remove('is-hidden');

    if (!ytApiReady) {
        loadYouTubeAPI().then(() => createPlayer(videoId));
    } else {
        createPlayer(videoId);
    }
}

function createPlayer(videoId) {
    const playerDiv = document.getElementById('videoPlayer');
    if (!playerDiv) return;

    // Destroy existing player if present (loadVideoById is buggy, destroy+recreate is reliable)
    if (ytPlayer) {
        try {
            ytPlayer.destroy();
        } catch (_) {}
        ytPlayer = null;
        // Reset the div so YT.Player can re-attach
        const wrapper = document.getElementById('videoPlayerWrapper');
        if (wrapper) {
            const oldPlayer = document.getElementById('videoPlayer');
            if (oldPlayer) oldPlayer.remove();
            const newDiv = document.createElement('div');
            newDiv.id = 'videoPlayer';
            newDiv.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
            wrapper.insertBefore(newDiv, wrapper.firstChild);
        }
    }

    console.log(`[VideoPlayer] Creating player for ${videoId}`);
    ytPlayer = new YT.Player('videoPlayer', {
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            fs: 1,
            cc_load_policy: 0, // Disable YouTube captions (we use our own)
        },
        events: {
            onReady: () => {
                console.log('[VideoPlayer] Player ready');
                // Re-apply subtitle sync if segments are loaded
                const select = document.getElementById('subtitleLangSelect');
                if (select && select.value) {
                    const vid = ChatHistory.getCurrentVideoId();
                    const segs = subtitleRegistry.get(vid, select.value);
                    if (segs) startSubtitleSync(segs, select.value);
                }
            },
            onStateChange: (e) => {}
        }
    });
}

function startSubtitleSync(segments, language) {
    currentSubtitleSegments = segments || [];
    subtitlesVisible = true;

    // Update the subtitle language selector
    const select = document.getElementById('subtitleLangSelect');
    if (select && language) {
        select.value = language;
    }
    const subtitleText = document.getElementById('subtitleText');
    const toggleBtn = document.getElementById('toggleSubsBtn');
    if (subtitleText) subtitleText.textContent = '';
    if (toggleBtn) {
        toggleBtn.classList.remove('is-light');
        toggleBtn.classList.add('is-info');
    }

    if (subtitleSyncInterval) clearInterval(subtitleSyncInterval);
    subtitleSyncInterval = setInterval(() => {
        if (!ytPlayer || !ytPlayer.getCurrentTime || !subtitlesVisible) return;
        const currentTime = ytPlayer.getCurrentTime();

        // Find the segment that matches current time
        let matched = false;
        for (const seg of currentSubtitleSegments) {
            if (currentTime >= seg.start && currentTime <= seg.end) {
                if (subtitleText && subtitleText.textContent !== seg.text) {
                    subtitleText.textContent = seg.text;
                    subtitleText.style.direction = /[\u0590-\u08FF\u0600-\u06FF]/.test(seg.text) ? 'rtl' : 'ltr';
                }
                matched = true;
                break;
            }
        }
        if (!matched && subtitleText) {
            subtitleText.textContent = '';
        }
    }, 100); // Update every 100ms for smooth subtitles
}

function stopSubtitleSync() {
    if (subtitleSyncInterval) {
        clearInterval(subtitleSyncInterval);
        subtitleSyncInterval = null;
    }
    const subtitleText = document.getElementById('subtitleText');
    if (subtitleText) subtitleText.textContent = '';
}

function toggleSubtitles() {
    subtitlesVisible = !subtitlesVisible;
    const subtitleOverlay = document.getElementById('subtitleOverlay');
    const toggleBtn = document.getElementById('toggleSubsBtn');
    if (subtitleOverlay) subtitleOverlay.style.display = subtitlesVisible ? '' : 'none';
    if (toggleBtn) {
        toggleBtn.classList.toggle('is-light', !subtitlesVisible);
        toggleBtn.classList.toggle('is-info', subtitlesVisible);
    }
    if (!subtitlesVisible) {
        const subtitleText = document.getElementById('subtitleText');
        if (subtitleText) subtitleText.textContent = '';
    }
}

// ===== Subtitle Management (view/delete cached translations) =====
function showSubtitleManager() {
    const videoId = ChatHistory.getCurrentVideoId();
    if (!videoId) {
        showError('Load a video first to manage subtitles.');
        return;
    }

    // Find all cached subtitles for this video
    const cachedSubs = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`subtitle_${videoId}_`)) {
            const lang = key.replace(`subtitle_${videoId}_`, '');
            try {
                const parsed = JSON.parse(localStorage.getItem(key));
                cachedSubs.push({
                    key,
                    lang,
                    segmentCount: parsed.segments?.length || 0,
                    sizeKB: ((localStorage.getItem(key)?.length || 0) / 1024).toFixed(1),
                    translatedFrom: parsed.translatedFrom || null,
                    model: parsed.model || null,
                    timestamp: parsed.timestamp ? new Date(parsed.timestamp).toLocaleString() : null,
                });
            } catch (_) {}
        }
    }

    // Remove existing modal
    const existing = document.getElementById('subtitleManagerModal');
    if (existing) { existing.remove(); return; }

    const registryLangs = subtitleRegistry.getLanguages(videoId);

    let bodyHtml = '';
    if (cachedSubs.length === 0) {
        bodyHtml = '<p class="has-text-grey">No cached subtitles for this video.</p>';
    } else {
        bodyHtml += '<table class="table is-fullwidth is-narrow is-striped">';
        bodyHtml += '<thead><tr><th>Language</th><th>Segments</th><th>Size</th><th>Source</th><th>Cached</th><th>In Player</th><th></th></tr></thead><tbody>';
        for (const sub of cachedSubs) {
            const isInRegistry = registryLangs.includes(sub.lang);
            const registryTag = isInRegistry
                ? '<span class="tag is-success is-light">Active</span>'
                : '<span class="tag is-light">Cached</span>';
            const sourceTag = sub.translatedFrom
                ? `<span class="tag is-info is-light">Translated from ${escapeHtml(getLanguageDisplayName(sub.translatedFrom))}</span>`
                : '<span class="tag is-warning is-light">Original</span>';
            bodyHtml += `<tr>
                <td><strong>${escapeHtml(getLanguageDisplayName(sub.lang))}</strong></td>
                <td>${sub.segmentCount}</td>
                <td>${sub.sizeKB} KB</td>
                <td>${sourceTag}</td>
                <td>${sub.timestamp || '?'}</td>
                <td>${registryTag}</td>
                <td>
                    <button class="button is-small is-danger is-light subtitle-del-btn" data-key="${escapeHtml(sub.key)}" data-lang="${escapeHtml(sub.lang)}">
                        <span class="icon is-small"><i class="fas fa-trash"></i></span>
                    </button>
                </td>
            </tr>`;
        }
        bodyHtml += '</tbody></table>';
    }

    const modal = document.createElement('div');
    modal.id = 'subtitleManagerModal';
    modal.className = 'modal is-active';
    modal.innerHTML = `
        <div class="modal-background"></div>
        <div class="modal-card" style="width:min(95%,650px)">
            <header class="modal-card-head">
                <p class="modal-card-title">📝 Subtitle Manager — ${escapeHtml(videoId)}</p>
                <button class="delete" aria-label="close" onclick="document.getElementById('subtitleManagerModal').remove()"></button>
            </header>
            <section class="modal-card-body">
                ${bodyHtml}
            </section>
            <footer class="modal-card-foot">
                <button class="button is-danger is-light subtitle-del-all-btn" ${cachedSubs.length === 0 ? 'disabled' : ''}>
                    <span class="icon is-small"><i class="fas fa-trash-alt"></i></span>
                    <span>Delete All Cached</span>
                </button>
                <button class="button" onclick="document.getElementById('subtitleManagerModal').remove()">Close</button>
            </footer>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-background').onclick = () => modal.remove();

    // Wire up delete buttons
    modal.querySelectorAll('.subtitle-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const lang = btn.dataset.lang;
            localStorage.removeItem(key);
            subtitleRegistry._subs[videoId]?.[lang] && delete subtitleRegistry._subs[videoId][lang];
            console.log(`[SubtitleManager] Deleted cached subtitle: ${key}`);
            // Re-populate the subtitle selector
            populateSubtitleSelector(videoId);
            // Refresh the modal
            modal.remove();
            showSubtitleManager();
        });
    });

    // Wire up delete all button
    const delAllBtn = modal.querySelector('.subtitle-del-all-btn');
    if (delAllBtn) {
        delAllBtn.addEventListener('click', () => {
            if (!confirm('Delete all cached subtitles for this video? This cannot be undone.')) return;
            for (const sub of cachedSubs) {
                localStorage.removeItem(sub.key);
            }
            subtitleRegistry.clear(videoId);
            console.log(`[SubtitleManager] Deleted all cached subtitles for ${videoId}`);
            populateSubtitleSelector(videoId);
            modal.remove();
        });
    }
}

// ===== Event Delegation for Dynamic Elements =====
// These MUST be outside DOMContentLoaded because main.js is loaded dynamically
// AFTER DOMContentLoaded has already fired (loaded by index.html's script).

document.addEventListener('submit', (e) => {
    if (e.target.matches('#chatForm')) {
        e.preventDefault();
        sendMessage();
    }
});

document.addEventListener('keypress', (e) => {
    if (e.target.matches('#chatInput') && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

document.addEventListener('click', (e) => {
    if (e.target.matches('#submitBtn') || e.target.closest('#submitBtn')) {
        e.preventDefault();
        handleSubmit();
    }
    if (e.target.matches('#subtitleBtn') || e.target.closest('#subtitleBtn')) {
        e.preventDefault();
        handleSubtitles();
    }
});

// Use event delegation for subtitle selector (element is in home.html, loaded after main.js)
document.addEventListener('change', (e) => {
    if (e.target.matches('#subtitleLangSelect')) {
        const videoId = ChatHistory.getCurrentVideoId();
        const selectedLang = e.target.value;
        console.log(`[SubtitleSelector] Changed to: "${selectedLang}" for video ${videoId}`);
        if (!videoId || !selectedLang) {
            stopSubtitleSync();
            return;
        }
        const segments = subtitleRegistry.get(videoId, selectedLang);
        console.log(`[SubtitleSelector] Found ${segments ? segments.length : 0} segments for "${selectedLang}"`);
        if (segments) {
            startSubtitleSync(segments, selectedLang);
        }
    }
});

// Use event delegation for Load Video and CC buttons (elements in home.html)
document.addEventListener('click', (e) => {
    if (e.target.matches('#loadVideoBtn') || e.target.closest('#loadVideoBtn')) {
        const videoId = ChatHistory.getCurrentVideoId();
        if (videoId) {
            console.log(`[VideoPlayer] Load Video clicked for ${videoId}`);
            loadVideoInPlayer(videoId);
        } else {
            const urlInput = document.getElementById('youtubeUrl');
            const vid = extractVideoId(urlInput?.value?.trim() || '');
            if (vid) loadVideoInPlayer(vid);
            else showError('Enter a YouTube URL first');
        }
    }
    if (e.target.matches('#toggleSubsBtn') || e.target.closest('#toggleSubsBtn')) {
        toggleSubtitles();
    }
    if (e.target.matches('#manageSubsBtn') || e.target.closest('#manageSubsBtn')) {
        showSubtitleManager();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const languageSelect = document.getElementById('languageSelect');
    const htmlTag = document.querySelector('html');

    if (!languageSelect || !htmlTag) {
        console.error('Required elements not found');
        return;
    }

    const savedLang = Settings.get('selectedLanguage') || 'en';
    languageSelect.value = savedLang;
    document.documentElement.lang = savedLang;
    document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr';
    updateUILanguage(savedLang);

    languageSelect.addEventListener('change', () => {
        const selectedLanguage = languageSelect.value;
        Settings.set('selectedLanguage', selectedLanguage);
        document.documentElement.lang = selectedLanguage;
        document.documentElement.dir = selectedLanguage === 'ar' ? 'rtl' : 'ltr';
        updateUILanguage(selectedLanguage);
    });

});
