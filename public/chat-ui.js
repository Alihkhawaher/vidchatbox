/* VidChatBox chat quality-of-life layer.
 * Keeps chat rendering, persistence, and interaction separate from caption/STT logic.
 */
(function () {
    'use strict';

    const STORE_PREFIX = 'chatConversation_';
    const LEGACY_PREFIX = 'chatHistory_';
    const MAX_HISTORY_MESSAGES = 20;
    let serverAbortController = null;
    let isGenerating = false;
    let pendingDelete = null;
    let initializedForm = null;

    const uid = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = () => new Date().toISOString();
    const currentLanguage = () => (window.Settings?.get('selectedLanguage') || document.documentElement.lang || 'en');
    const isArabic = () => currentLanguage() === 'ar';
    const text = (en, ar) => isArabic() ? ar : en;

    function escapeHTML(value) {
        const node = document.createElement('div');
        node.textContent = value == null ? '' : String(value);
        return node.innerHTML;
    }

    function safeMarkdown(markdown) {
        let value = escapeHTML(markdown || '');
        const codeBlocks = [];
        value = value.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const index = codeBlocks.push(`<pre><code class="language-${escapeHTML(lang)}">${code.trim()}</code></pre>`) - 1;
            return `%%CODE_BLOCK_${index}%%`;
        });
        value = value
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
            .replace(/^[-*] (.+)$/gm, '• $1')
            .replace(/\n/g, '<br>');
        codeBlocks.forEach((block, index) => {
            value = value.replace(`%%CODE_BLOCK_${index}%%`, block);
        });
        return value;
    }

    function getVideoId() {
        return document.getElementById('captionsContent')?.dataset.videoId || null;
    }

    function getCaptions() {
        return document.getElementById('captionsContent')?.dataset.rawCaptions || '';
    }

    function getMessagesElement() {
        return document.querySelector('#chatResponse .chat-messages');
    }

    function getProvider() {
        return typeof window.getChatProvider === 'function' ? window.getChatProvider() : 'webllm';
    }

    function providerLabel(provider = getProvider()) {
        if (provider === 'webllm') return window.ChatLLM?.getPreferredModel?.() || 'Browser AI';
        if (provider === 'openrouter') return window.Settings?.get('cloudChatModel') || 'OpenRouter';
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }

    function updateProviderBadge() {
        const badge = document.getElementById('chatProviderBadge');
        const name = document.getElementById('chatProviderName');
        if (!badge || !name) return;
        name.textContent = providerLabel();
        badge.classList.remove('is-hidden');
    }

    function updateChatVisibility() {
        const messages = getMessagesElement();
        const empty = document.getElementById('chatEmptyState');
        const hasMessages = Boolean(messages?.querySelector('.chat-message'));
        messages?.classList.toggle('is-hidden', !hasMessages);
        empty?.classList.toggle('is-hidden', hasMessages);
        document.getElementById('clearChatBtn')?.classList.toggle('is-hidden', !hasMessages);
        document.getElementById('exportChatBtn')?.classList.toggle('is-hidden', !hasMessages);
    }

    function formatTime(iso) {
        const date = new Date(iso || Date.now());
        return date.toLocaleTimeString(currentLanguage() === 'ar' ? 'ar-SA' : undefined, {
            hour: '2-digit', minute: '2-digit'
        });
    }

    function messageRole(element) {
        if (element.classList.contains('user-message')) return 'user';
        if (element.classList.contains('system-message')) return 'system';
        return 'assistant';
    }

    function createAction(icon, title, action, danger = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `chat-msg-action-btn${danger ? ' is-danger' : ''}`;
        button.dataset.action = action;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.innerHTML = `<i class="fas fa-${icon}"></i>`;
        return button;
    }

    function addMessageMeta(element, role, createdAt = now()) {
        element.querySelector('.chat-message-meta')?.remove();
        const meta = document.createElement('div');
        meta.className = 'chat-message-meta';
        const timestamp = document.createElement('time');
        timestamp.className = 'chat-message-timestamp';
        timestamp.dateTime = createdAt;
        timestamp.textContent = formatTime(createdAt);
        const actions = document.createElement('div');
        actions.className = 'chat-msg-actions';
        actions.appendChild(createAction('copy', text('Copy', 'نسخ'), 'copy'));
        if (role === 'user') actions.appendChild(createAction('pen', text('Edit', 'تعديل'), 'edit'));
        if (role === 'assistant') actions.appendChild(createAction('redo', text('Regenerate', 'إعادة التوليد'), 'regenerate'));
        if (role !== 'system') actions.appendChild(createAction('trash', text('Delete', 'حذف'), 'delete', true));
        meta.append(timestamp, actions);
        element.appendChild(meta);
        element.dataset.createdAt = createdAt;
    }

    function createMessage(role, content, options = {}) {
        const element = document.createElement('div');
        element.className = `chat-message ${role === 'user' ? 'user-message' : role === 'system' ? 'system-message' : 'ai-message'}`;
        element.dataset.messageId = options.id || uid();
        element.dataset.rawContent = content || '';
        element.dataset.role = role;
        element.setAttribute('dir', 'auto');
        const body = document.createElement('div');
        body.className = 'message-content';
        body.setAttribute('dir', 'auto');
        if (options.typing) {
            body.innerHTML = '<div class="chat-typing-indicator" aria-label="Generating"><span></span><span></span><span></span></div>';
        } else if (role === 'assistant' && options.markdown !== false) {
            body.innerHTML = safeMarkdown(content);
        } else {
            body.textContent = content || '';
        }
        element.appendChild(body);
        if (!options.typing) addMessageMeta(element, role, options.createdAt || now());
        return element;
    }

    function enhanceExistingMessages() {
        getMessagesElement()?.querySelectorAll('.chat-message').forEach((element) => {
            const role = messageRole(element);
            const content = element.dataset.rawContent || element.querySelector('.message-content')?.textContent?.trim() || '';
            element.dataset.messageId ||= uid();
            element.dataset.rawContent = content;
            element.dataset.role = role;
            element.setAttribute('dir', 'auto');
            element.querySelector('.message-content')?.setAttribute('dir', 'auto');
            element.querySelectorAll('.copy-btn').forEach((button) => button.remove());
            if (!element.querySelector('.chat-typing-indicator') && !element.querySelector('.chat-message-meta')) {
                addMessageMeta(element, role, element.dataset.createdAt || now());
            }
        });
        updateChatVisibility();
    }

    function collectConversationMessages() {
        return Array.from(getMessagesElement()?.querySelectorAll('.chat-message:not(.system-message)') || [])
            .filter((element) => !element.querySelector('.chat-typing-indicator'))
            .map((element) => ({
                id: element.dataset.messageId || uid(),
                role: messageRole(element),
                content: element.dataset.rawContent || element.querySelector('.message-content')?.textContent?.trim() || '',
                createdAt: element.dataset.createdAt || now()
            }));
    }

    function getMetadataFromDOM() {
        const system = getMessagesElement()?.querySelector('.system-message .message-content');
        const title = system?.querySelector('strong')?.textContent?.replace(/^🎬\s*/, '') || getVideoId() || text('Video conversation', 'محادثة فيديو');
        const thumbnail = system?.querySelector('img')?.src || '';
        return { title, thumbnail };
    }

    function writeConversation(conversation) {
        if (!conversation?.videoId) return;
        try {
            localStorage.setItem(STORE_PREFIX + conversation.videoId, JSON.stringify(conversation));
        } catch (error) {
            console.warn('Unable to write conversation:', error);
        }
    }

    function saveConversation() {
        const videoId = getVideoId();
        if (!videoId) return;
        const previous = loadConversation(videoId) || {};
        const metadata = getMetadataFromDOM();
        const conversation = {
            version: 2,
            videoId,
            title: metadata.title || previous.title || videoId,
            thumbnail: metadata.thumbnail || previous.thumbnail || '',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            captions: getCaptions() || previous.captions || '',
            provider: getProvider(),
            messages: collectConversationMessages(),
            createdAt: previous.createdAt || now(),
            updatedAt: now()
        };
        try {
            writeConversation(conversation);
            localStorage.setItem(LEGACY_PREFIX + videoId, JSON.stringify(conversation.messages.map((message) => ({
                type: message.role === 'assistant' ? 'ai' : message.role,
                content: message.content,
                createdAt: message.createdAt
            }))));
        } catch (error) {
            console.warn('Unable to save conversation:', error);
        }
    }

    function loadConversation(videoId) {
        try {
            const rich = localStorage.getItem(STORE_PREFIX + videoId);
            const legacy = localStorage.getItem(LEGACY_PREFIX + videoId);
            if (rich) {
                const conversation = JSON.parse(rich);
                if ((!Array.isArray(conversation.messages) || conversation.messages.length === 0) && legacy) {
                    const legacyMessages = JSON.parse(legacy)
                        .filter(entry => entry.type !== 'system')
                        .map(entry => ({
                            id: uid(),
                            role: entry.type === 'ai' ? 'assistant' : entry.type,
                            content: entry.content,
                            createdAt: entry.createdAt || now()
                        }));
                    if (legacyMessages.length) conversation.messages = legacyMessages;
                }
                return conversation;
            }
            if (!legacy) return null;
            const messages = JSON.parse(legacy).filter((entry) => entry.type !== 'system').map((entry) => ({
                id: uid(), role: entry.type === 'ai' ? 'assistant' : entry.type, content: entry.content,
                createdAt: entry.createdAt || now()
            }));
            return { version: 1, videoId, title: videoId, captions: '', messages, updatedAt: now() };
        } catch (error) {
            return null;
        }
    }

    function findCachedTranscript(videoId) {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(`transcript_${videoId}_`)) return localStorage.getItem(key) || '';
        }
        return '';
    }

    function conversationHistory(excludeLastUser = false) {
        const messages = collectConversationMessages();
        if (excludeLastUser && messages.at(-1)?.role === 'user') messages.pop();
        return messages.slice(-MAX_HISTORY_MESSAGES).map(({ role, content }) => ({ role, content }));
    }

    function shouldAutoScroll(container) {
        return container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    }

    function scrollToBottom(force = false) {
        const container = getMessagesElement();
        if (container && (force || shouldAutoScroll(container))) container.scrollTop = container.scrollHeight;
    }

    function setGenerating(value) {
        isGenerating = value;
        document.getElementById('sendBtn')?.classList.toggle('is-hidden', value);
        document.getElementById('stopBtn')?.classList.toggle('is-hidden', !value);
        const input = document.getElementById('chatInput');
        if (input) input.disabled = value;
    }

    function showCopyFeedback(button) {
        const original = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        button.classList.add('is-success');
        setTimeout(() => {
            button.innerHTML = original;
            button.classList.remove('is-success');
        }, 1400);
    }

    async function copyMessage(element, button) {
        const content = element.dataset.rawContent || element.querySelector('.message-content')?.textContent || '';
        try {
            await navigator.clipboard.writeText(content);
            showCopyFeedback(button);
        } catch (error) {
            window.showError?.(text('Could not copy this message.', 'تعذر نسخ هذه الرسالة.'));
        }
    }

    function editMessage(element) {
        if (element.classList.contains('editing') || isGenerating) return;
        const original = element.dataset.rawContent || '';
        const body = element.querySelector('.message-content');
        const meta = element.querySelector('.chat-message-meta');
        element.classList.add('editing');
        meta?.classList.add('is-hidden');
        body.innerHTML = '';
        const area = document.createElement('div');
        area.className = 'chat-edit-area';
        area.innerHTML = `<textarea dir="auto"></textarea><div class="chat-edit-actions"><button type="button" class="button is-small" data-edit-action="cancel">${text('Cancel', 'إلغاء')}</button><button type="button" class="button is-primary is-small" data-edit-action="save">${text('Save & resend', 'حفظ وإعادة الإرسال')}</button></div>`;
        const textarea = area.querySelector('textarea');
        textarea.value = original;
        body.appendChild(area);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        area.addEventListener('click', async (event) => {
            const action = event.target.closest('[data-edit-action]')?.dataset.editAction;
            if (!action) return;
            if (action === 'cancel') {
                body.textContent = original;
                element.classList.remove('editing');
                meta?.classList.remove('is-hidden');
                return;
            }
            const revised = textarea.value.trim();
            if (!revised) return;
            let next = element.nextElementSibling;
            while (next) {
                const following = next.nextElementSibling;
                if (!next.classList.contains('system-message')) next.remove();
                next = following;
            }
            element.dataset.rawContent = revised;
            body.textContent = revised;
            element.classList.remove('editing');
            meta?.classList.remove('is-hidden');
            saveConversation();
            await sendEnhancedMessage({ message: revised, appendUser: false });
        }, { once: false });
    }

    function showUndoToast(onUndo) {
        document.querySelector('.chat-undo-toast')?.remove();
        const toast = document.createElement('div');
        toast.className = 'chat-undo-toast';
        toast.innerHTML = `<span>${text('Message deleted', 'تم حذف الرسالة')}</span><button type="button">${text('Undo', 'تراجع')}</button>`;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            toast.remove();
            pendingDelete = null;
        };
        toast.querySelector('button').onclick = () => {
            onUndo();
            finish();
        };
        document.body.appendChild(toast);
        setTimeout(finish, 5000);
    }

    function deleteMessage(element) {
        if (isGenerating) return;
        const parent = element.parentElement;
        const next = element.nextSibling;
        element.remove();
        pendingDelete = { element, parent, next };
        saveConversation();
        updateChatVisibility();
        showUndoToast(() => {
            parent.insertBefore(element, next);
            saveConversation();
            updateChatVisibility();
        });
    }

    async function regenerateMessage(element) {
        if (isGenerating) return;
        let prompt = element.previousElementSibling;
        while (prompt && !prompt.classList.contains('user-message')) prompt = prompt.previousElementSibling;
        if (!prompt) return;
        const message = prompt.dataset.rawContent || prompt.querySelector('.message-content')?.textContent?.trim();
        element.remove();
        saveConversation();
        await sendEnhancedMessage({ message, appendUser: false });
    }

    function renderStreamContent(element, content) {
        element.dataset.rawContent = content;
        let body = element.querySelector('.message-content');
        if (!body) {
            body = document.createElement('div');
            body.className = 'message-content';
            body.setAttribute('dir', 'auto');
            element.prepend(body);
        }
        body.innerHTML = safeMarkdown(content);
    }

    async function streamWebLLM(message, captions, responseElement, history) {
        if (!window.ChatLLM?.isSupported()) throw new Error(text('Browser AI needs WebGPU support.', 'ذكاء المتصفح يحتاج إلى دعم WebGPU.'));
        const model = window.ChatLLM.getPreferredModel();
        const stream = window.ChatLLM.generateStream(message, captions, model, (progress) => {
            if (progress.stage === 'downloading' || progress.stage === 'loading_model') {
                renderStreamContent(responseElement, `🧠 ${progress.message || text('Loading model…', 'جارٍ تحميل النموذج…')}`);
            }
        }, history);
        let full = '';
        let aborted = false;
        for await (const chunk of stream) {
            if (chunk.type === 'chunk') {
                full = chunk.fullContent;
                const stayPinned = shouldAutoScroll(getMessagesElement());
                renderStreamContent(responseElement, full);
                if (stayPinned) scrollToBottom(true);
            }
            if (chunk.type === 'final' && chunk.aborted) aborted = true;
        }
        if (aborted) throw new DOMException('Aborted', 'AbortError');
        return full;
    }

    async function streamServer(message, captions, provider, responseElement, history) {
        const settings = window.Settings?.load() || {};
        const headers = { 'Content-Type': 'application/json' };
        const key = provider === 'openrouter' ? settings.openrouterApiKey : provider === 'google' ? settings.googleApiKey : settings.claudeApiKey;
        if (key) headers['X-API-Key'] = key;
        serverAbortController = new AbortController();
        const response = await fetch('/api/chat', {
            method: 'POST', headers, signal: serverAbortController.signal,
            body: JSON.stringify({ message, captions, provider, model: settings.cloudChatModel || undefined, history })
        });
        if (!response.ok) throw new Error(text('The chat request failed.', 'فشل طلب المحادثة.'));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const event of events) {
                const line = event.split('\n').find((part) => part.startsWith('data:'));
                if (!line) continue;
                const data = JSON.parse(line.replace(/^data:\s*/, ''));
                if (data.type === 'error') throw new Error(data.error?.message || data.error || text('Chat failed.', 'فشلت المحادثة.'));
                if (data.type === 'chunk') {
                    if (data.content || data.delta) full += data.content || data.delta;
                    else if (data.markdown) full = data.markdown;
                }
                if (data.type === 'final') full = data.markdown || data.content || full;
                if (full) {
                    const stayPinned = shouldAutoScroll(getMessagesElement());
                    renderStreamContent(responseElement, full);
                    if (stayPinned) scrollToBottom(true);
                }
            }
        }
        return full;
    }

    async function sendEnhancedMessage(options = {}) {
        if (isGenerating) return;
        const input = document.getElementById('chatInput');
        const message = (options.message ?? input?.value ?? '').trim();
        if (!message) return;
        const messages = getMessagesElement();
        if (!messages) return;
        messages.classList.remove('is-hidden');
        document.getElementById('chatEmptyState')?.classList.add('is-hidden');
        const appendUser = options.appendUser !== false;
        if (appendUser) messages.appendChild(createMessage('user', message));
        const history = conversationHistory(true);
        saveConversation();
        const responseElement = createMessage('assistant', '', { typing: true });
        messages.appendChild(responseElement);
        if (input) {
            input.value = '';
            resizeInput(input);
        }
        setGenerating(true);
        updateProviderBadge();
        updateChatVisibility();
        scrollToBottom(true);
        try {
            const provider = getProvider();
            const captions = getCaptions();
            const result = provider === 'webllm'
                ? await streamWebLLM(message, captions, responseElement, history)
                : await streamServer(message, captions, provider, responseElement, history);
            if (!result && serverAbortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            responseElement.querySelector('.chat-typing-indicator')?.remove();
            renderStreamContent(responseElement, result || text('No response was returned.', 'لم يتم إرجاع رد.'));
            addMessageMeta(responseElement, 'assistant', now());
            saveConversation();
        } catch (error) {
            if (error.name === 'AbortError') {
                const partial = responseElement.dataset.rawContent || '';
                if (partial) {
                    renderStreamContent(responseElement, `${partial}\n\n_${text('Generation stopped.', 'تم إيقاف التوليد.')} _`);
                    addMessageMeta(responseElement, 'assistant', now());
                } else {
                    responseElement.remove();
                }
            } else {
                responseElement.classList.add('chat-message-error');
                renderStreamContent(responseElement, `⚠️ ${error.message}`);
                addMessageMeta(responseElement, 'assistant', now());
            }
            saveConversation();
        } finally {
            serverAbortController = null;
            setGenerating(false);
            updateChatVisibility();
            input?.focus();
        }
    }

    function stopGeneration() {
        serverAbortController?.abort();
        window.ChatLLM?.abort?.();
    }

    function resizeInput(input) {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
        const counter = document.getElementById('chatCharCount');
        if (counter) counter.textContent = input.value.length.toLocaleString(currentLanguage() === 'ar' ? 'ar-SA' : undefined);
    }

    function renderSavedMessages(conversation) {
        const messages = getMessagesElement();
        if (!messages) return;
        messages.innerHTML = '';
        conversation.messages?.forEach((message) => messages.appendChild(createMessage(message.role, message.content, message)));
        updateChatVisibility();
        scrollToBottom(true);
    }

    function formattedTranscript(captions) {
        const escaped = escapeHTML(captions || '');
        return escaped.replace(/\[(\d{2}:\d{2}:\d{2})\]/g, '<span class="timestamp">[$1]</span>');
    }

    function createVideoContextMessage(conversation) {
        const message = document.createElement('div');
        message.className = 'chat-message system-message video-context-message';
        message.dataset.messageId = `video_${conversation.videoId}`;
        message.dataset.role = 'system';
        const body = document.createElement('div');
        body.className = 'message-content';
        const thumbnail = conversation.thumbnail
            ? `<img src="${escapeHTML(conversation.thumbnail)}" alt="" style="max-width:200px;border-radius:6px;margin-bottom:0.5rem;"><br>`
            : '';
        body.innerHTML = `${thumbnail}<strong>🎬 ${escapeHTML(conversation.title || conversation.videoId)}</strong><br><a href="${escapeHTML(conversation.url || `https://youtube.com/watch?v=${conversation.videoId}`)}" target="_blank" rel="noopener">${escapeHTML(conversation.url || `https://youtube.com/watch?v=${conversation.videoId}`)}</a>`;
        message.appendChild(body);
        return message;
    }

    function createTranscriptMessage(captions) {
        const message = document.createElement('div');
        message.className = 'chat-message system-message transcript-message';
        message.dataset.messageId = 'transcript_context';
        message.dataset.role = 'system';
        message.dataset.rawContent = captions;
        const body = document.createElement('div');
        body.className = 'message-content';
        const rtl = /[\u0590-\u08FF]/.test(captions || '');
        body.innerHTML = `<strong class="transcript-label">📝 ${text('Video transcript', 'نص الفيديو')}</strong><div class="transcript-content" dir="${rtl ? 'rtl' : 'auto'}">${formattedTranscript(captions)}</div>`;
        message.appendChild(body);
        addMessageMeta(message, 'system', now());
        return message;
    }

    function renderConversation(conversation, captions) {
        const messages = getMessagesElement();
        if (!messages) return;
        messages.innerHTML = '';
        messages.appendChild(createVideoContextMessage(conversation));
        if (captions) messages.appendChild(createTranscriptMessage(captions));
        conversation.messages?.forEach((message) => messages.appendChild(createMessage(message.role, message.content, message)));
        updateChatVisibility();
        scrollToBottom(true);
    }

    function onCaptionsReady({ videoId, captions, provider, meta }) {
        if (!videoId) return;
        const previous = loadConversation(videoId) || {};
        const conversation = {
            version: 2,
            ...previous,
            videoId,
            title: meta?.title || previous.title || videoId,
            thumbnail: meta?.thumbnail || previous.thumbnail || '',
            url: meta?.url || previous.url || `https://www.youtube.com/watch?v=${videoId}`,
            captions,
            provider,
            messages: Array.isArray(previous.messages) ? previous.messages : [],
            createdAt: previous.createdAt || now(),
            updatedAt: now()
        };
        writeConversation(conversation);
        const messages = getMessagesElement();
        if (conversation.messages.length && !messages?.querySelector('.user-message, .ai-message')) {
            conversation.messages.forEach(message => messages.appendChild(createMessage(message.role, message.content, message)));
        }
        enhanceExistingMessages();
        updateChatVisibility();
    }

    async function resumeConversation(videoId) {
        const cachedTranscript = findCachedTranscript(videoId);
        const conversation = loadConversation(videoId) || {
            version: 2,
            videoId,
            title: videoId,
            thumbnail: '',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            captions: cachedTranscript,
            provider: getProvider(),
            messages: [],
            createdAt: now(),
            updatedAt: now()
        };
        const input = document.getElementById('youtubeUrl');
        if (input) input.value = conversation.url || `https://youtube.com/watch?v=${videoId}`;
        const captionsElement = document.getElementById('captionsContent');
        const resumedCaptions = conversation.captions || cachedTranscript;
        if (captionsElement) {
            captionsElement.dataset.videoId = videoId;
            captionsElement.dataset.rawCaptions = resumedCaptions;
            captionsElement.dataset.provider = conversation.provider || getProvider();
            captionsElement.setAttribute('dir', /[\u0590-\u08FF]/.test(resumedCaptions) ? 'rtl' : 'auto');
            captionsElement.innerHTML = formattedTranscript(resumedCaptions);
            captionsElement.classList.toggle('is-hidden', !resumedCaptions);
        }
        if (resumedCaptions) {
            const model = conversation.transcriptModel || 'resumed';
            try { localStorage.setItem(`transcript_${videoId}_${window.Settings?.get('selectedLanguage') || 'en'}_${model}`, resumedCaptions); } catch (_) {}
        }
        conversation.captions = resumedCaptions;
        writeConversation(conversation);
        renderConversation(conversation, resumedCaptions);
        updateProviderBadge();
        document.getElementById('history-panel')?.remove();
        document.getElementById('chatInput')?.focus();
    }

    function allConversations() {
        const ids = new Set();
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(STORE_PREFIX)) ids.add(key.slice(STORE_PREFIX.length));
            if (key?.startsWith(LEGACY_PREFIX)) ids.add(key.slice(LEGACY_PREFIX.length));
            if (key?.startsWith('transcript_')) {
                const match = key.match(/^transcript_(.{11})_/);
                if (match) ids.add(match[1]);
            }
        }
        return Array.from(ids).map(videoId => loadConversation(videoId) || ({
            version: 2,
            videoId,
            title: videoId,
            thumbnail: '',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            captions: findCachedTranscript(videoId),
            messages: [],
            createdAt: now(),
            updatedAt: now()
        })).filter(Boolean).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }

    function renderHistoryList(panel, query = '') {
        const list = panel.querySelector('.history-list');
        const normalized = query.trim().toLowerCase();
        const conversations = allConversations().filter((item) => {
            const haystack = `${item.title || ''} ${item.videoId || ''} ${item.messages?.at(-1)?.content || ''}`.toLowerCase();
            return !normalized || haystack.includes(normalized);
        });
        list.innerHTML = '';
        if (!conversations.length) {
            list.innerHTML = `<p class="has-text-grey has-text-centered p-4">${text('No matching conversations.', 'لا توجد محادثات مطابقة.')}</p>`;
            return;
        }
        conversations.forEach((conversation) => {
            const item = document.createElement('article');
            item.className = 'history-item';
            item.dataset.videoId = conversation.videoId;
            const preview = conversation.messages?.at(-1)?.content || text('No messages yet', 'لا توجد رسائل بعد');
            const thumbnail = conversation.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(conversation.videoId)}/mqdefault.jpg`;
            item.innerHTML = `
                <img class="history-item-thumbnail" src="${escapeHTML(thumbnail)}" alt="" loading="lazy">
                <div class="history-item-main">
                    <strong class="history-item-title">${escapeHTML(conversation.title || conversation.videoId)}</strong>
                    <span class="history-item-preview" dir="auto">${escapeHTML(preview)}</span>
                    <span class="history-item-date">${new Date(conversation.updatedAt || Date.now()).toLocaleString(currentLanguage() === 'ar' ? 'ar-SA' : undefined)} · ${conversation.messages?.length || 0} ${text('messages', 'رسائل')}</span>
                </div>
                <div class="history-item-actions">
                    <button type="button" class="button is-small is-primary" data-history-action="resume">${text('Continue', 'متابعة')}</button>
                    <button type="button" class="button is-small is-danger is-light" data-history-action="delete" aria-label="${text('Delete', 'حذف')}"><span class="icon is-small"><i class="fas fa-trash"></i></span></button>
                </div>`;
            list.appendChild(item);
        });
    }

    function showHistoryPanel() {
        const existing = document.getElementById('history-panel');
        if (existing) { existing.remove(); return; }
        const panel = document.createElement('section');
        panel.id = 'history-panel';
        panel.className = 'box history-panel';
        panel.innerHTML = `
            <div class="history-panel-toolbar"><strong>💬 ${text('Conversation history', 'سجل المحادثات')}</strong><button type="button" class="button is-small" data-history-action="close">${text('Close', 'إغلاق')}</button></div>
            <input class="input history-search" type="search" dir="auto" placeholder="${text('Search conversations…', 'البحث في المحادثات…')}">
            <div class="history-list"></div>`;
        document.getElementById('chatContainer')?.prepend(panel);
        renderHistoryList(panel);
        panel.querySelector('.history-search').addEventListener('input', (event) => renderHistoryList(panel, event.target.value));
        panel.addEventListener('click', (event) => {
            const action = event.target.closest('[data-history-action]')?.dataset.historyAction;
            if (!action) return;
            if (action === 'close') return panel.remove();
            const item = event.target.closest('.history-item');
            if (!item) return;
            if (action === 'resume') resumeConversation(item.dataset.videoId);
            if (action === 'delete' && confirm(text('Delete this conversation?', 'هل تريد حذف هذه المحادثة؟'))) {
                const videoId = item.dataset.videoId;
                localStorage.removeItem(STORE_PREFIX + videoId);
                localStorage.removeItem(LEGACY_PREFIX + videoId);
                // Also delete all cached transcripts for this video
                const transcriptKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(`transcript_${videoId}_`)) {
                        transcriptKeys.push(k);
                    }
                }
                transcriptKeys.forEach(k => localStorage.removeItem(k));
                item.remove();
            }
        });
    }

    function exportConversation() {
        const videoId = getVideoId();
        const conversation = videoId ? loadConversation(videoId) : null;
        const messages = collectConversationMessages();
        if (!messages.length) return;
        const output = [
            `# ${conversation?.title || text('Video conversation', 'محادثة فيديو')}`,
            conversation?.url || '', '',
            ...messages.map((message) => `## ${message.role === 'user' ? text('You', 'أنت') : text('Assistant', 'المساعد')}\n\n${message.content}\n`)
        ].join('\n');
        navigator.clipboard.writeText(output).then(() => window.showStatus?.(text('Conversation copied as Markdown.', 'تم نسخ المحادثة بصيغة Markdown.'), 'success'));
    }

    function copyAllMessages() {
        const messages = collectConversationMessages();
        if (!messages.length) return;
        const output = messages.map((message) => `${message.role === 'user' ? text('You', 'أنت') : text('Assistant', 'المساعد')}: ${message.content}`).join('\n\n');
        navigator.clipboard.writeText(output).then(() => window.showStatus?.(text('Conversation copied.', 'تم نسخ المحادثة.'), 'success'));
    }

    function clearEnhancedChat() {
        if (!confirm(text('Clear this conversation? The saved transcript will be kept.', 'هل تريد مسح هذه المحادثة؟ سيتم الاحتفاظ بالنص المفرغ.'))) return;
        const videoId = getVideoId();
        getMessagesElement()?.querySelectorAll('.chat-message:not(.system-message)').forEach((message) => message.remove());
        if (videoId) {
            localStorage.removeItem(STORE_PREFIX + videoId);
            localStorage.removeItem(LEGACY_PREFIX + videoId);
        }
        updateChatVisibility();
    }

    function initializeChatUI() {
        const form = document.getElementById('chatForm');
        const input = document.getElementById('chatInput');
        if (!form || !input || initializedForm === form) return;
        initializedForm = form;
        input.setAttribute('dir', 'auto');
        input.addEventListener('input', () => resizeInput(input));
        resizeInput(input);
        const copyAllButton = document.getElementById('copyAllBtn');
        if (copyAllButton) copyAllButton.onclick = copyAllMessages;
        updateProviderBadge();
        enhanceExistingMessages();
        document.getElementById('captionsContent')?.setAttribute('dir', 'auto');
        document.querySelectorAll('.transcribe-preview, .transcribe-status, .transcribe-detail').forEach((element) => element.setAttribute('dir', 'auto'));
        const messages = getMessagesElement();
        messages?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            const element = event.target.closest('.chat-message');
            if (!button || !element) return;
            const action = button.dataset.action;
            if (action === 'copy') copyMessage(element, button);
            if (action === 'edit') editMessage(element);
            if (action === 'delete') deleteMessage(element);
            if (action === 'regenerate') regenerateMessage(element);
        });
        const observer = new MutationObserver(() => {
            enhanceExistingMessages();
            document.querySelectorAll('.transcribe-preview, .transcribe-status, .transcribe-detail').forEach((element) => element.setAttribute('dir', 'auto'));
        });
        observer.observe(document.getElementById('chatResponse'), { childList: true, subtree: true });
    }

    document.addEventListener('keydown', (event) => {
        if (event.target.matches('#chatInput') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            event.stopImmediatePropagation();
            sendEnhancedMessage();
        }
        if (event.key === 'Escape' && isGenerating) stopGeneration();
    }, true);

    document.addEventListener('submit', (event) => {
        if (event.target.matches('#chatForm')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            sendEnhancedMessage();
        }
    }, true);

    const pageObserver = new MutationObserver(initializeChatUI);
    pageObserver.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
    initializeChatUI();

    window.sendMessage = sendEnhancedMessage;
    window.stopGeneration = stopGeneration;
    window.showHistoryPanel = showHistoryPanel;
    window.exportConversation = exportConversation;
    window.clearChat = clearEnhancedChat;
    window.VidChatStore = { saveConversation, loadConversation, resumeConversation, collectConversationMessages, onCaptionsReady };
})();