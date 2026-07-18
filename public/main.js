// ===== Utility Functions =====
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
    
    const savedModel = window.Transcriber ? Transcriber.getPreferredModel() : 'whisper-medium';
    const modelLabel = `<span class="tag is-info is-light tag-model">${savedModel}</span>`;
    
    panel.innerHTML = `
        <div class="transcribe-progress-header">
            <strong>🎙️ Browser Transcription</strong>${deviceLabel}${modelLabel}
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
                html += `<div>${icon} ${shortName}: ${loadedMB}/${totalMB}MB (${filePct}%)</div>`;
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
        showError('Enter a YouTube URL first to get download links.');
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
                <p class="has-text-centered"><em>Loading download links...</em></p>
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

        let html = '';
        const renderSection = (title, icon, formats) => {
            if (!formats || formats.length === 0) return '';
            let s = `<h4 class="title is-6 mt-3">${icon} ${title}</h4>`;
            s += '<table class="table is-fullwidth is-narrow is-striped"><thead><tr><th>Quality</th><th>Format</th><th>Size</th><th></th></tr></thead><tbody>';
            for (const f of formats) {
                s += `<tr><td>${escapeHtml(f.quality)}</td><td>${escapeHtml(f.ext)}</td><td>${escapeHtml(f.size)}</td><td><a href="${f.url}" target="_blank" rel="noopener" class="button is-small is-primary is-light">Download</a></td></tr>`;
            }
            s += '</tbody></table>';
            return s;
        };

        html += renderSection('Video + Audio', '\u{1F4F9}', data.videoAudio);
        html += renderSection('Audio Only', '\u{1F50A}', data.audioOnly);
        html += renderSection('Video Only', '\u{1F3AC}', data.videoOnly);

        if (!html) html = '<p class="has-text-grey">No download formats available.</p>';
        body.innerHTML = html;
    } catch (e) {
        const body = document.getElementById('downloadModalBody');
        if (body) body.innerHTML = `<p class="has-text-danger">Failed to load: ${escapeHtml(e.message)}</p>`;
    }
}

function clearChat() {
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) chatMessages.innerHTML = '';

    const captionsContent = document.getElementById('captionsContent');
    if (captionsContent) {
        captionsContent.removeAttribute('data-raw-captions');
        captionsContent.removeAttribute('data-provider');
        captionsContent.removeAttribute('data-video-id');
        captionsContent.innerHTML = '';
    }
    hideElement('captions');
    hideElement('error');
    hideElement('status');

    const videoId = ChatHistory.getCurrentVideoId();
    if (videoId) ChatHistory.clear(videoId);

    if (videoId) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`transcript_${videoId}_`)) {
                keys.push(key);
            }
        }
        keys.forEach(k => localStorage.removeItem(k));
    }

    showStatus('Chat and transcript history cleared.', 'info');
}

function updateCaptionsUI(captions, provider, videoId) {
    const captionsContent = document.getElementById('captionsContent');
    const currentLang = Settings.get('selectedLanguage') || 'en';
    const formattedCaptions = formatCaptions(captions);
    
    if (captionsContent) {
        captionsContent.innerHTML = formattedCaptions;
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

        if (videoId) {
            fetchVideoMetadata(videoId).then(meta => {
                const metaMessage = document.createElement('div');
                metaMessage.className = 'chat-message system-message';
                const metaContent = document.createElement('div');
                metaContent.className = 'message-content';

                if (meta) {
                    const thumbHtml = meta.thumbnail ? `<img src="${meta.thumbnail}" alt="Video thumbnail" style="max-width:200px;border-radius:6px;margin-bottom:0.5rem;"><br>` : '';
                    const descHtml = meta.description ? `<p style="font-size:0.9em;opacity:0.8;margin-top:0.5rem;white-space:pre-wrap;">${escapeHtml(meta.description)}</p>` : '';
                    metaContent.innerHTML = `
                        ${thumbHtml}
                        <strong>🎬 ${escapeHtml(meta.title)}</strong><br>
                        <span style="opacity:0.7;">👤 ${escapeHtml(meta.author)}</span><br>
                        <a href="${meta.url}" target="_blank" rel="noopener">${meta.url}</a>
                        ${descHtml}
                    `;
                } else {
                    metaContent.innerHTML = `<strong>🎬 Video:</strong> <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener">https://www.youtube.com/watch?v=${videoId}</a>`;
                }

                metaMessage.appendChild(metaContent);
                chatMessages.appendChild(metaMessage);

                addTranscriptionMessage(chatMessages, captions, formattedCaptions);

                chatMessages.scrollTop = chatMessages.scrollHeight;
                showElement('chatResponse');
            });
        } else {
            addTranscriptionMessage(chatMessages, captions, formattedCaptions);
            showElement('chatResponse');
        }
    }
}

function addTranscriptionMessage(chatMessages, rawCaptions, formattedCaptions) {
    const systemMessage = document.createElement('div');
    systemMessage.className = 'chat-message system-message';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `<strong>📝 Video Captions:</strong><br>${formattedCaptions}`;
    systemMessage.appendChild(contentDiv);
    systemMessage.appendChild(createCopyButton(rawCaptions));
    chatMessages.appendChild(systemMessage);
}

function showHistoryPanel() {
    const existing = document.getElementById('history-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'history-panel';
    panel.className = 'box history-panel';

    const transcripts = [];
    const chatEntries = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('transcript_')) {
            const value = localStorage.getItem(key);
            const sizeKB = value ? (value.length / 1024).toFixed(1) : '0';
            const parts = key.replace('transcript_', '').split('_');
            const videoId = parts[0];
            const lang = parts[1] || '?';
            const model = parts.slice(2).join('_') || '?';
            transcripts.push({ key, videoId, lang, model, sizeKB });
        }
        if (key && key.startsWith('chatHistory_')) {
            const videoId = key.replace('chatHistory_', '');
            const value = localStorage.getItem(key);
            let msgCount = 0;
            try { msgCount = JSON.parse(value).length; } catch(e) {}
            chatEntries.push({ key, videoId, msgCount });
        }
    }

    let html = `<div class="level mb-2">
        <div class="level-left"><strong>📂 Saved Transcripts</strong></div>
        <div class="level-right">
            <button class="button is-small is-danger is-light" onclick="clearAllHistory()">
                <span class="icon is-small"><i class="fas fa-trash-alt"></i></span>
                <span>Delete All</span>
            </button>
            <button class="button is-small is-light" onclick="document.getElementById('history-panel').remove()">
                <span class="icon is-small"><i class="fas fa-times"></i></span>
                <span>Close</span>
            </button>
        </div>
    </div>`;

    if (transcripts.length === 0 && chatEntries.length === 0) {
        html += '<p class="has-text-grey">No saved transcripts or chat history.</p>';
    }

    if (transcripts.length > 0) {
        html += '<div class="history-list">';
        for (const t of transcripts) {
            html += `<div class="history-item">
                <div class="history-item-info">
                    <strong><a href="https://youtube.com/watch?v=${t.videoId}" target="_blank">${t.videoId}</a></strong>
                    <span class="tag is-info is-light">${t.lang}</span>
                    <span class="tag is-light">${t.model}</span>
                    <span class="has-text-grey">${t.sizeKB} KB</span>
                </div>
                <div class="history-item-actions">
                    <button class="button is-small is-success is-light" onclick="loadSavedTranscript('${t.videoId}', '${t.lang}', '${t.model}')">
                        <span class="icon is-small"><i class="fas fa-play"></i></span>
                    </button>
                    <button class="button is-small is-danger is-light" onclick="deleteTranscript('${t.key}')">
                        <span class="icon is-small"><i class="fas fa-trash"></i></span>
                    </button>
                </div>
            </div>`;
        }
        html += '</div>';
    }

    if (chatEntries.length > 0) {
        html += '<h4 class="title is-6 mt-3">💬 Chat History</h4>';
        html += '<div class="history-list">';
        for (const c of chatEntries) {
            const hasTranscript = transcripts.some(t => t.videoId === c.videoId);
            if (!hasTranscript) {
                html += `<div class="history-item">
                    <div class="history-item-info">
                        <strong>${c.videoId}</strong>
                        <span class="has-text-grey">${c.msgCount} messages</span>
                    </div>
                    <div class="history-item-actions">
                        <button class="button is-small is-danger is-light" onclick="deleteChatHistory('${c.key}')">
                            <span class="icon is-small"><i class="fas fa-trash"></i></span>
                        </button>
                    </div>
                </div>`;
            }
        }
        html += '</div>';
    }

    panel.innerHTML = html;

    const chatResponse = document.getElementById('chatResponse');
    if (chatResponse) {
        chatResponse.parentNode.insertBefore(panel, chatResponse);
    }
}

function deleteTranscript(key) {
    localStorage.removeItem(key);
    showStatus('Transcript deleted.', 'info');
    const panel = document.getElementById('history-panel');
    if (panel) { panel.remove(); showHistoryPanel(); }
}

function deleteChatHistory(key) {
    localStorage.removeItem(key);
    showStatus('Chat history deleted.', 'info');
    const panel = document.getElementById('history-panel');
    if (panel) { panel.remove(); showHistoryPanel(); }
}

function clearAllHistory() {
    if (!confirm('Delete ALL saved transcripts and chat history? This cannot be undone.')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('transcript_') || key.startsWith('chatHistory_'))) {
            keys.push(key);
        }
    }
    keys.forEach(k => localStorage.removeItem(k));
    showStatus(`Deleted ${keys.length} saved entries.`, 'info');
    const panel = document.getElementById('history-panel');
    if (panel) { panel.remove(); showHistoryPanel(); }
}

function loadSavedTranscript(videoId, lang, model) {
    const key = `transcript_${videoId}_${lang}_${model}`;
    const captions = localStorage.getItem(key);
    if (!captions) {
        showError('Transcript not found in cache.');
        return;
    }
    const provider = getChatProvider();
    const urlInput = document.getElementById('youtubeUrl');
    if (urlInput) urlInput.value = `https://www.youtube.com/watch?v=${videoId}`;
    updateCaptionsUI(captions, provider, videoId);
    const panel = document.getElementById('history-panel');
    if (panel) panel.remove();
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
                return `<p style="margin:0;"><span class="timestamp">${ts}</span> ${chunk.text.trim()}</p>`;
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
        const captions = await Transcriber.transcribe(
            videoId,
            language,
            selectedTranscribeModel,
            onProgress,
            onPartial
        );
        
        try {
            const cacheKey = `transcript_${videoId}_${language}_${selectedTranscribeModel}`;
            localStorage.setItem(cacheKey, captions);
            logDebug(`Cached transcript for ${videoId} (model: ${selectedTranscribeModel})`);
        } catch (e) {
            logDebug(`Failed to cache transcript: ${e.message}`);
        }
        logDebug(`Browser transcription complete, length: ${captions.length} characters`);
        
        hideTranscribeProgress();
        return captions;
    } catch (transcribeError) {
        if (transcribeError.name === 'AbortError') {
            showStatus('Transcription cancelled by user.', 'info');
            hideTranscribeProgress();
            disableButton('submitBtn', false);
            return null;
        }
        throw transcribeError;
    }
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
                showStatus('Transcribed via cloud. Cached locally for future use.', 'success');
            } else {
                showStatus('Transcribed from audio using browser AI. Model cached for future use.', 'success');
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

// ===== Decomposed sendMessage =====

async function sendWebLLMMessage(message, captions, aiResponseDiv, chatMessages) {
    if (!window.ChatLLM || !ChatLLM.isSupported()) {
        throw new Error('WebLLM is not supported in this browser. WebGPU is required (Chrome/Edge 113+).');
    }

    const webllmModel = ChatLLM.getPreferredModel();
    logDebug(`WebLLM: Starting inference with model ${webllmModel}`);

    const onLLMProgress = (progress) => {
        hideElement('loading');
        const contentDiv = aiResponseDiv.querySelector('.message-content');
        if (progress.stage === 'downloading' || progress.stage === 'loading_model') {
            if (!contentDiv) {
                const div = document.createElement('div');
                div.className = 'message-content';
                div.innerHTML = `<em>🧠 Loading WebLLM model... ${progress.progress}%</em>`;
                aiResponseDiv.innerHTML = '';
                aiResponseDiv.appendChild(div);
            } else {
                contentDiv.innerHTML = `<em>🧠 Loading WebLLM model... ${progress.progress}%</em>`;
            }
        } else if (progress.stage === 'ready') {
            if (contentDiv) {
                contentDiv.innerHTML = `<em>🧠 Model loaded! Generating response...</em>`;
            }
        }
    };

    const stream = ChatLLM.generateStream(message, captions, webllmModel, onLLMProgress);
    let fullContent = '';

    for await (const chunk of stream) {
        if (chunk.type === 'chunk') {
            fullContent = chunk.fullContent;
            const contentDiv = aiResponseDiv.querySelector('.message-content') || document.createElement('div');
            contentDiv.className = 'message-content';
            const formatted = escapeHtml(fullContent)
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
            contentDiv.innerHTML = formatted;
            if (!aiResponseDiv.contains(contentDiv)) {
                aiResponseDiv.innerHTML = '';
                aiResponseDiv.appendChild(contentDiv);
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else if (chunk.type === 'final') {
            aiResponseDiv.appendChild(createCopyButton(fullContent));
        }
    }

    return fullContent;
}

async function sendServerMessage(message, captions, provider, aiResponseDiv, chatMessages) {
    const settings = Settings.load();
    const currentLang = Settings.get('selectedLanguage') || 'en';
    const headers = {
        'Content-Type': 'application/json'
    };

    if (provider === 'google' && settings.googleApiKey) {
        headers['X-API-Key'] = settings.googleApiKey;
    } else if (['claude', 'haiku', 'sonnet'].includes(provider) && settings.claudeApiKey) {
        headers['X-API-Key'] = settings.claudeApiKey;
    } else if (provider === 'openrouter' && settings.openrouterApiKey) {
        headers['X-API-Key'] = settings.openrouterApiKey;
    }

    const conversationHistory = ChatHistory.collectMessages()
        .filter(m => m.type !== 'system')
        .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }));

    const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            message,
            captions,
            provider,
            model: Settings.get('cloudChatModel') || undefined,
            history: conversationHistory.slice(-10),
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: translations[currentLang].errors.sendFailed }));
        throw new Error(errorData.message || translations[currentLang].errors.sendFailed);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    
                    switch (data.type) {
                        case 'chunk':
                        case 'final':
                            const content = data.html || data.markdown || data.error || 'No response content';
                            fullContent = data.markdown || content.replace(/<[^>]*>/g, '');
                            const contentDiv = document.createElement('div');
                            contentDiv.className = 'message-content';
                            contentDiv.innerHTML = content;
                            
                            aiResponseDiv.innerHTML = '';
                            aiResponseDiv.appendChild(contentDiv);
                            aiResponseDiv.appendChild(createCopyButton(fullContent));
                            
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                            break;
                        case 'error':
                            const errorMessage = typeof data.error === 'object' ? 
                                (data.error.message || JSON.stringify(data.error)) : 
                                data.error || translations[currentLang].errors.sendFailed;
                            showError(errorMessage);
                            if (aiResponseDiv) aiResponseDiv.remove();
                            return null;
                    }

                    if (data.type === 'final') {
                        const videoId = ChatHistory.getCurrentVideoId();
                        if (videoId) {
                            const allMessages = ChatHistory.collectMessages();
                            ChatHistory.save(videoId, allMessages);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing SSE data:', e);
                    showError(translations[currentLang].errors.sendFailed);
                    if (aiResponseDiv) aiResponseDiv.remove();
                    return null;
                }
            }
        }
    }

    return fullContent;
}

async function sendMessage() {
    console.log('[sendMessage] Called');
    const chatInput = document.getElementById('chatInput');
    const chatResponse = document.getElementById('chatResponse');
    const captionsContent = document.getElementById('captionsContent');

    if (!chatInput || !chatResponse) {
        console.error('[sendMessage] Required DOM elements not found');
        return;
    }

    const currentLang = (window.Settings ? Settings.get('selectedLanguage') : null) || 'en';
    const t = (window.translations && translations[currentLang]) ? translations[currentLang] : {};

    hideElement('error');

    const message = chatInput.value.trim();
    if (!message) {
        showError(t.errors?.enterMessage || 'Please enter a message');
        return;
    }

    const captions = captionsContent ? (captionsContent.getAttribute('data-raw-captions') || '') : '';
    const provider = getChatProvider();
    console.log(`[sendMessage] message="${message.substring(0, 50)}..." provider=${provider} captionsLen=${captions.length}`);

    let aiResponseDiv;
    try {
        disableButton('sendBtn', true);
        setElementText('loading', t.processingMessage || 'Processing...');
        showElement('loading');

        if (!chatResponse.querySelector('.chat-messages')) {
            chatResponse.innerHTML = '<div class="chat-messages"></div>';
        }
        const chatMessages = chatResponse.querySelector('.chat-messages');
        
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'chat-message user-message';
        const userContent = document.createElement('div');
        userContent.className = 'message-content';
        userContent.textContent = message;
        const userCopyBtn = createCopyButton(message);
        userMessageDiv.appendChild(userContent);
        userMessageDiv.appendChild(userCopyBtn);
        chatMessages.appendChild(userMessageDiv);

        aiResponseDiv = document.createElement('div');
        aiResponseDiv.className = 'chat-message ai-message';
        chatMessages.appendChild(aiResponseDiv);
        
        showElement('chatResponse');
        chatMessages.scrollTop = chatMessages.scrollHeight;

        let responseContent;
        if (provider === 'webllm') {
            responseContent = await sendWebLLMMessage(message, captions, aiResponseDiv, chatMessages);
        } else {
            responseContent = await sendServerMessage(message, captions, provider, aiResponseDiv, chatMessages);
        }

        if (responseContent !== null && chatInput) {
            chatInput.value = '';
        }

        const videoId = ChatHistory.getCurrentVideoId();
        if (videoId && responseContent !== null) {
            const allMessages = ChatHistory.collectMessages();
            ChatHistory.save(videoId, allMessages);
        }

    } catch (error) {
        console.error('[sendMessage] Error:', error);
        showError(getFriendlyErrorMessage(error));
        if (aiResponseDiv) aiResponseDiv.remove();
    } finally {
        disableButton('sendBtn', false);
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
        showStatus('Copied to clipboard!', 'success');
    }).catch(() => {
        showError('Failed to copy text');
    });
}

function copyAllMessages() {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;

    const messages = [];
    chatMessages.querySelectorAll('.chat-message').forEach(msg => {
        const content = msg.querySelector('.message-content')?.textContent || msg.textContent;
        const type = msg.classList.contains('user-message') ? 'User' : 
                    msg.classList.contains('system-message') ? 'System' : 'AI';
        messages.push(`${type}: ${content.trim()}`);
    });

    const text = messages.join('\n\n');
    copyText(text);
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
});

document.addEventListener('DOMContentLoaded', () => {
    const copyAllBtn = document.getElementById('copyAllBtn');
    if (copyAllBtn) {
        copyAllBtn.onclick = copyAllMessages;
    }

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