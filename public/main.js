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

// ===== Chat History (Data Model) =====
const ChatHistory = {
    STORAGE_PREFIX: 'chatHistory_',
    _messages: {},

    generateId() {
        return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    },

    load(videoId) {
        try {
            const raw = localStorage.getItem(this.STORAGE_PREFIX + videoId);
            const parsed = raw ? JSON.parse(raw) : [];
            this._messages[videoId] = parsed.map(m => ({
                id: m.id || this.generateId(),
                type: m.type,
                content: m.content || '',
                html: m.html || '',
                timestamp: m.timestamp || Date.now(),
                status: m.status || 'complete',
            }));
            return this._messages[videoId];
        } catch (e) {
            this._messages[videoId] = [];
            return [];
        }
    },

    getAll(videoId) {
        if (!this._messages[videoId]) this.load(videoId);
        return this._messages[videoId];
    },

    add(videoId, msg) {
        if (!this._messages[videoId]) this.load(videoId);
        msg.id = msg.id || this.generateId();
        msg.timestamp = msg.timestamp || Date.now();
        msg.status = msg.status || 'complete';
        this._messages[videoId].push(msg);
        this._persist(videoId);
        return msg;
    },

    update(videoId, msgId, updates) {
        const msgs = this._messages[videoId];
        if (!msgs) return null;
        const msg = msgs.find(m => m.id === msgId);
        if (msg) {
            Object.assign(msg, updates);
            this._persist(videoId);
        }
        return msg;
    },

    remove(videoId, msgId) {
        const msgs = this._messages[videoId];
        if (!msgs) return;
        const idx = msgs.findIndex(m => m.id === msgId);
        if (idx !== -1) {
            msgs.splice(idx, 1);
            this._persist(videoId);
        }
    },

    save(videoId, messages) {
        this._messages[videoId] = messages;
        this._persist(videoId);
    },

    clear(videoId) {
        this._messages[videoId] = [];
        localStorage.removeItem(this.STORAGE_PREFIX + videoId);
    },

    getCurrentVideoId() {
        const captionsContent = document.getElementById('captionsContent');
        if (!captionsContent) return null;
        return captionsContent.getAttribute('data-video-id') || null;
    },

    collectMessages() {
        const videoId = this.getCurrentVideoId();
        if (!videoId) return [];
        return this.getAll(videoId).map(m => ({
            type: m.type,
            content: m.content,
        }));
    },

    restoreMessages(messages) {
        const chatResponse = document.getElementById('chatResponse');
        if (!chatResponse) return;

        let chatMessages = chatResponse.querySelector('.chat-messages');
        if (!chatMessages) {
            chatMessages = document.createElement('div');
            chatMessages.className = 'chat-messages';
            chatResponse.innerHTML = '';
            chatResponse.appendChild(chatMessages);
        }
        chatMessages.innerHTML = '';

        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
            chatMessages.appendChild(createMessageElement(msg));
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
        showElement('chatResponse');
    },

    _persist(videoId) {
        try {
            localStorage.setItem(this.STORAGE_PREFIX + videoId, JSON.stringify(this._messages[videoId] || []));
        } catch (e) {
            logDebug(`Failed to save chat history: ${e.message}`);
        }
    },
};

// ===== Message Element Builder =====

function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Build a full chat message element from a message data object */
function createMessageElement(msg) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${msg.type}-message`;
    msgDiv.setAttribute('data-msg-id', msg.id);
    msgDiv.setAttribute('data-msg-type', msg.type);

    // System messages: content + actions (no header)
    if (msg.type === 'system') {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.setAttribute('dir', 'auto');
        contentDiv.innerHTML = msg.html || escapeHtml(msg.content);
        msgDiv.appendChild(contentDiv);
        const actions = buildMessageActions(msg);
        msgDiv.appendChild(actions);
        return msgDiv;
    }

    // Header: role label + timestamp
    const header = document.createElement('div');
    header.className = 'message-header';
    const role = document.createElement('span');
    role.className = 'message-role';
    role.textContent = msg.type === 'user' ? 'You' : 'AI';
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatRelativeTime(msg.timestamp);
    header.appendChild(role);
    header.appendChild(time);
    msgDiv.appendChild(header);

    // Content with dir="auto" for RTL detection
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.setAttribute('dir', 'auto');
    if (msg.type === 'ai' && msg.html) {
        contentDiv.innerHTML = msg.html;
    } else {
        contentDiv.textContent = msg.content;
    }
    msgDiv.appendChild(contentDiv);

    // Action buttons
    const actions = buildMessageActions(msg);
    msgDiv.appendChild(actions);

    return msgDiv;
}

/** Build the action buttons row for a message */
function buildMessageActions(msg) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action';
    copyBtn.setAttribute('data-action', 'copy');
    copyBtn.title = 'Copy';
    copyBtn.textContent = '\u{1F4CB}';
    actions.appendChild(copyBtn);

    if (msg.type === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action';
        editBtn.setAttribute('data-action', 'edit');
        editBtn.title = 'Edit';
        editBtn.textContent = '\u270F\uFE0F';
        actions.appendChild(editBtn);
    }

    if (msg.type === 'ai') {
        const regenBtn = document.createElement('button');
        regenBtn.className = 'msg-action';
        regenBtn.setAttribute('data-action', 'regenerate');
        regenBtn.title = 'Regenerate';
        regenBtn.textContent = '\u{1F504}';
        actions.appendChild(regenBtn);
    }

    if (msg.type !== 'system') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'msg-action msg-action-danger';
        deleteBtn.setAttribute('data-action', 'delete');
        deleteBtn.title = 'Delete';
        deleteBtn.textContent = '\u{1F5D1}\uFE0F';
        actions.appendChild(deleteBtn);
    }

    return actions;
}

// ===== Message Actions (Edit, Delete, Regenerate) =====

function handleEditMessage(msgId) {
    const msgDiv = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!msgDiv) return;
    const contentDiv = msgDiv.querySelector('.message-content');
    if (!contentDiv) return;
    const videoId = ChatHistory.getCurrentVideoId();
    const msg = videoId ? ChatHistory.getAll(videoId).find(m => m.id === msgId) : null;
    if (!msg) return;

    if (msgDiv.querySelector('.message-content-edit')) return;

    const textarea = document.createElement('textarea');
    textarea.className = 'message-content-edit';
    textarea.value = msg.content;
    textarea.setAttribute('dir', 'auto');
    contentDiv.style.display = 'none';

    const editActions = document.createElement('div');
    editActions.className = 'message-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'button is-small is-primary';
    saveBtn.textContent = 'Save & Resend';
    saveBtn.onclick = () => handleSaveEdit(msgId, textarea.value);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button is-small is-light';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => handleCancelEdit(msgId);

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    contentDiv.parentNode.insertBefore(textarea, contentDiv.nextSibling);
    contentDiv.parentNode.insertBefore(editActions, textarea.nextSibling);
    textarea.focus();
    textarea.style.height = textarea.scrollHeight + 'px';
}

function handleCancelEdit(msgId) {
    const msgDiv = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!msgDiv) return;
    const contentDiv = msgDiv.querySelector('.message-content');
    const textarea = msgDiv.querySelector('.message-content-edit');
    const editActions = msgDiv.querySelector('.message-edit-actions');
    if (contentDiv) contentDiv.style.display = '';
    if (textarea) textarea.remove();
    if (editActions) editActions.remove();
}

function handleSaveEdit(msgId, newContent) {
    const videoId = ChatHistory.getCurrentVideoId();
    if (!videoId) return;

    ChatHistory.update(videoId, msgId, { content: newContent });

    const msgDiv = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!msgDiv) return;

    // Remove all messages after this one
    let sibling = msgDiv.nextElementSibling;
    while (sibling) {
        const nextSibling = sibling.nextElementSibling;
        const sibId = sibling.getAttribute('data-msg-id');
        if (sibId) ChatHistory.remove(videoId, sibId);
        sibling.remove();
        sibling = nextSibling;
    }

    // Remove the edited message too
    ChatHistory.remove(videoId, msgId);
    msgDiv.remove();

    // Re-send with the edited content
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.value = newContent;
        sendMessage();
    }
}

function handleDeleteMessage(msgId) {
    const videoId = ChatHistory.getCurrentVideoId();
    if (!videoId) return;

    const msgDiv = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!msgDiv) return;

    const msgType = msgDiv.getAttribute('data-msg-type');

    // If deleting a user message, also delete the AI response after it
    if (msgType === 'user') {
        const nextSibling = msgDiv.nextElementSibling;
        if (nextSibling && nextSibling.getAttribute('data-msg-type') === 'ai') {
            const nextId = nextSibling.getAttribute('data-msg-id');
            if (nextId) ChatHistory.remove(videoId, nextId);
            nextSibling.remove();
        }
    }

    ChatHistory.remove(videoId, msgId);
    msgDiv.remove();
}

function handleRegenerateMessage(msgId) {
    const videoId = ChatHistory.getCurrentVideoId();
    if (!videoId) return;

    const msgDiv = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!msgDiv) return;

    const prevSibling = msgDiv.previousElementSibling;
    if (!prevSibling || prevSibling.getAttribute('data-msg-type') !== 'user') {
        showError('No preceding user message found to regenerate from.');
        return;
    }

    const prevMsgId = prevSibling.getAttribute('data-msg-id');
    const prevMsg = ChatHistory.getAll(videoId).find(m => m.id === prevMsgId);
    if (!prevMsg) return;

    ChatHistory.remove(videoId, msgId);
    msgDiv.remove();

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.value = prevMsg.content;
        sendMessage();
    }
}

// ===== Typing Indicator =====

function showTypingIndicator() {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;
    const existing = chatMessages.querySelector('.typing-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span>Thinking...</span>';
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
}

// ===== Scroll to Bottom =====

function setupScrollToBottom() {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;

    let scrollBtn = chatMessages.parentElement?.querySelector('.scroll-to-bottom');
    if (!scrollBtn) {
        scrollBtn = document.createElement('button');
        scrollBtn.className = 'scroll-to-bottom';
        scrollBtn.textContent = '\u2193 New messages';
        scrollBtn.onclick = () => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };
        chatMessages.parentElement?.insertBefore(scrollBtn, chatMessages.nextSibling);
    }

    chatMessages.addEventListener('scroll', () => {
        const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 100;
        scrollBtn.classList.toggle('is-visible', !isNearBottom);
    });
}

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
            <p class="transcribe-prompt-title"><strong>\u{1F4F9} No captions available</strong></p>
            <p class="transcribe-prompt-text">This video doesn't have YouTube captions. Would you like to transcribe the audio in your browser using AI?</p>
            <div class="field">
                <label class="label is-small">Whisper Model</label>
                <div class="select is-small is-fullwidth">
                    <select id="transcribeModelSelect">
                        <optgroup label="Local (browser, no API key)">
                            <option value="whisper-medium" ${currentModel === 'whisper-medium' ? 'selected' : ''}>\u2B50 whisper-medium (~1.7GB) \u2014 Best Arabic quality (WebGPU)</option>
                            <option value="whisper-small" ${currentModel === 'whisper-small' ? 'selected' : ''}>\u{1F3AF} whisper-small (~510MB) \u2014 Fallback / no WebGPU</option>
                        </optgroup>
                        <optgroup label="Cloud (OpenRouter API key required)">
                            <option value="openrouter-whisper-large-v3" ${currentModel === 'openrouter-whisper-large-v3' ? 'selected' : ''}>\u2601\uFE0F Whisper Large V3 \u2014 Best quality, instant</option>
                            <option value="openrouter-gpt-4o-transcribe" ${currentModel === 'openrouter-gpt-4o-transcribe' ? 'selected' : ''}>\u2601\uFE0F GPT-4o Transcribe \u2014 High quality</option>
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
        '<span class="tag is-success is-light tag-device">\u26A1 WebGPU</span>' : 
        '<span class="tag is-warning is-light tag-device">WASM</span>';
    
    const savedModel = window.Transcriber ? Transcriber.getPreferredModel() : 'whisper-medium';
    const modelLabel = `<span class="tag is-info is-light tag-model">${savedModel}</span>`;
    
    panel.innerHTML = `
        <div class="transcribe-progress-header">
            <strong>\u{1F399}\uFE0F Browser Transcription</strong>${deviceLabel}${modelLabel}
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
                const icon = filePct >= 100 ? '\u2705' : '\u2B07\uFE0F';
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
        <p class="retry-error-message"><strong>\u274C Error:</strong> ${escapeHtml(errorMessage)}</p>
        <p class="retry-suggestion">\u{1F4A1} You can try again \u2014 sometimes YouTube caption fetching fails temporarily.</p>
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
        return 'Network error \u2014 could not reach the server. Check your internet connection and try again.';
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
        return 'Rate limit exceeded \u2014 too many requests. Please wait a few minutes and try again.';
    }
    if (msg.includes('Invalid YouTube URL') || msg.includes('Invalid URL')) {
        return 'The URL you entered doesn\'t look like a valid YouTube link. Make sure it includes the video ID (e.g., https://youtube.com/watch?v=XXXXXXX).';
    }
    if (msg.includes('OpenRouter API key')) {
        return 'OpenRouter API key is required for cloud transcription. Add it in Settings \u2192 Cloud AI.';
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

/** Clear all chat and transcript history */
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
                let metaHtml = '';
                if (meta) {
                    const thumbHtml = meta.thumbnail ? `<img src="${meta.thumbnail}" alt="Video thumbnail" style="max-width:200px;border-radius:6px;margin-bottom:0.5rem;"><br>` : '';
                    const descHtml = meta.description ? `<p style="font-size:0.9em;opacity:0.8;margin-top:0.5rem;white-space:pre-wrap;">${escapeHtml(meta.description)}</p>` : '';
                    metaHtml = `
                        ${thumbHtml}
                        <strong>\u{1F3AC} ${escapeHtml(meta.title)}</strong><br>
                        <span style="opacity:0.7;">\u{1F464} ${escapeHtml(meta.author)}</span><br>
                        <a href="${meta.url}" target="_blank" rel="noopener">${meta.url}</a>
                        ${descHtml}
                    `;
                } else {
                    metaHtml = `<strong>\u{1F3AC} Video:</strong> <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener">https://www.youtube.com/watch?v=${videoId}</a>`;
                }

                const metaMsg = {
                    id: 'meta-' + videoId,
                    type: 'system',
                    html: metaHtml,
                    timestamp: Date.now(),
                };
                chatMessages.appendChild(createMessageElement(metaMsg));

                // Add transcription below metadata
                addTranscriptionMessage(chatMessages, captions, formattedCaptions, videoId);

                chatMessages.scrollTop = chatMessages.scrollHeight;
                showElement('chatResponse');
            });
        } else {
            addTranscriptionMessage(chatMessages, captions, formattedCaptions, videoId);
            showElement('chatResponse');
        }
    }
}

/** Add the transcription system message to chat */
function addTranscriptionMessage(chatMessages, rawCaptions, formattedCaptions, videoId) {
    const transMsg = {
        id: 'trans-' + (videoId || Date.now()),
        type: 'system',
        html: `<strong>\u{1F4DD} Video Captions:</strong><br>${formattedCaptions}`,
        content: rawCaptions,
        timestamp: Date.now(),
    };
    chatMessages.appendChild(createMessageElement(transMsg));
}

/** Show a panel listing all saved transcripts with delete options */
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
        <div class="level-left"><strong>\u{1F4C2} Saved Transcripts</strong></div>
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
        html += '<h4 class="title is-6 mt-3">\u{1F4AC} Chat History</h4>';
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
        logDebug(`Error: ${error.message}`);
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
            if (contentDiv) {
                contentDiv.innerHTML = `<em>\u{1F9E0} Loading WebLLM model... ${progress.progress}%</em>`;
            }
        } else if (progress.stage === 'ready') {
            if (contentDiv) {
                contentDiv.innerHTML = `<em>\u{1F9E0} Model loaded! Generating response...</em>`;
            }
        }
    };

    const stream = ChatLLM.generateStream(message, captions, webllmModel, onLLMProgress);
    let fullContent = '';

    for await (const chunk of stream) {
        if (chunk.type === 'chunk') {
            fullContent = chunk.fullContent;
            const contentDiv = aiResponseDiv.querySelector('.message-content');
            if (contentDiv) {
                const formatted = escapeHtml(fullContent)
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');
                contentDiv.innerHTML = formatted;
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
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
        logDebug('Using Google API key');
    } else if (['claude', 'haiku', 'sonnet'].includes(provider) && settings.claudeApiKey) {
        headers['X-API-Key'] = settings.claudeApiKey;
        logDebug('Using Claude API key');
    } else if (provider === 'openrouter' && settings.openrouterApiKey) {
        headers['X-API-Key'] = settings.openrouterApiKey;
        logDebug('Using OpenRouter API key');
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
                            const contentDiv = aiResponseDiv.querySelector('.message-content');
                            if (contentDiv) {
                                contentDiv.innerHTML = content;
                            }
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
                } catch (e) {
                    logDebug(`Error parsing SSE data: ${e.message}`);
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
    const chatInput = document.getElementById('chatInput');
    const chatResponse = document.getElementById('chatResponse');
    const captionsContent = document.getElementById('captionsContent');

    if (!chatInput || !chatResponse) return;

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
    const videoId = ChatHistory.getCurrentVideoId();

    let aiMsgId = null;
    try {
        disableButton('sendBtn', true);
        setElementText('loading', t.processingMessage || 'Processing...');
        showElement('loading');

        if (!chatResponse.querySelector('.chat-messages')) {
            chatResponse.innerHTML = '<div class="chat-messages"></div>';
        }
        const chatMessages = chatResponse.querySelector('.chat-messages');

        // Add user message to history and render
        const userMsg = videoId
            ? ChatHistory.add(videoId, { type: 'user', content: message })
            : { id: ChatHistory.generateId(), type: 'user', content: message, timestamp: Date.now() };
        chatMessages.appendChild(createMessageElement(userMsg));

        // Add AI placeholder to history and render
        const aiMsg = videoId
            ? ChatHistory.add(videoId, { type: 'ai', content: '', html: '', status: 'streaming' })
            : { id: ChatHistory.generateId(), type: 'ai', content: '', html: '', status: 'streaming', timestamp: Date.now() };
        aiMsgId = aiMsg.id;
        const aiResponseDiv = createMessageElement(aiMsg);
        chatMessages.appendChild(aiResponseDiv);

        showElement('chatResponse');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        setupScrollToBottom();

        // Call provider
        let responseContent;
        if (provider === 'webllm') {
            responseContent = await sendWebLLMMessage(message, captions, aiResponseDiv, chatMessages);
        } else {
            responseContent = await sendServerMessage(message, captions, provider, aiResponseDiv, chatMessages);
        }

        if (responseContent !== null && chatInput) {
            chatInput.value = '';
        }

        // Update AI message in history with final content
        if (videoId && aiMsgId && responseContent !== null) {
            const contentDiv = aiResponseDiv.querySelector('.message-content');
            ChatHistory.update(videoId, aiMsgId, {
                content: responseContent,
                html: contentDiv?.innerHTML || '',
                status: 'complete',
            });
        }

    } catch (error) {
        logDebug(`[sendMessage] Error: ${error.message}`);
        showError(getFriendlyErrorMessage(error));
        if (aiMsgId) {
            const el = document.querySelector(`[data-msg-id="${aiMsgId}"]`);
            if (el) el.remove();
            if (videoId) ChatHistory.remove(videoId, aiMsgId);
        }
    } finally {
        disableButton('sendBtn', false);
        hideElement('loading');
        hideTypingIndicator();
    }
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

// Handle chat form submission (send button click)
document.addEventListener('submit', (e) => {
    if (e.target.matches('#chatForm')) {
        e.preventDefault();
        sendMessage();
    }
});

// Handle chat input Enter key
document.addEventListener('keypress', (e) => {
    if (e.target.matches('#chatInput') && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// Handle "Get Captions" button and message action buttons
document.addEventListener('click', (e) => {
    if (e.target.matches('#submitBtn') || e.target.closest('#submitBtn')) {
        e.preventDefault();
        handleSubmit();
    }

    // Handle message action buttons (copy, edit, delete, regenerate)
    const actionBtn = e.target.closest('.msg-action');
    if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const action = actionBtn.getAttribute('data-action');
        const msgDiv = actionBtn.closest('.chat-message');
        const msgId = msgDiv?.getAttribute('data-msg-id');
        if (!msgId) return;

        switch (action) {
            case 'copy':
                const contentEl = msgDiv.querySelector('.message-content');
                const text = contentEl?.textContent || '';
                copyText(text.trim());
                break;
            case 'edit':
                handleEditMessage(msgId);
                break;
            case 'delete':
                handleDeleteMessage(msgId);
                break;
            case 'regenerate':
                handleRegenerateMessage(msgId);
                break;
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const copyAllBtn = document.getElementById('copyAllBtn');
    if (copyAllBtn) {
        copyAllBtn.onclick = copyAllMessages;
    }

    const languageSelect = document.getElementById('languageSelect');
    const providerSelect = document.getElementById('providerSelect');
    const htmlTag = document.querySelector('html');
    const chatInput = document.getElementById('chatInput');

    if (!languageSelect || !htmlTag) {
        logDebug('Required elements not found');
        return;
    }

    if (providerSelect) {
        const savedProvider = Settings.get('selectedProvider') || 'google';
        providerSelect.value = savedProvider;
        
        providerSelect.addEventListener('change', (e) => {
            const selectedProvider = e.target.value;
            Settings.set('selectedProvider', selectedProvider);
            logDebug(`Provider changed to: ${selectedProvider}`);
            
            const captionsContent = document.getElementById('captionsContent');
            if (captionsContent) {
                captionsContent.setAttribute('data-provider', selectedProvider);
            }
        });
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