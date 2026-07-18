/**
 * Unified Settings Module for VidChatBox
 * Consolidates all settings into a single localStorage key with validation,
 * reset-to-defaults, and AI-mode-driven show/hide logic.
 */
const Settings = (function () {
    const STORAGE_KEY = 'vidchatbox_settings';

    const DEFAULTS = {
        // AI Mode: 'local' | 'cloud' | 'auto'
        aiMode: 'local',

        // Browser AI (local)
        whisperModel: 'whisper-medium',
        webllmModel: 'Bonsai-1.7B',

        // Cloud AI
        openrouterApiKey: '',
        cloudChatModel: '',
        cloudSttModel: 'openrouter-mai-transcribe',
        audioSpeed: '1.0',

        // Advanced
        googleApiKey: '',
        claudeApiKey: '',
        debugMode: false,

        // UI preferences
        selectedLanguage: 'en',
        selectedProvider: 'google',
    };

    // Valid values for validation
    const VALID = {
        aiMode: ['local', 'cloud', 'auto'],
        whisperModel: ['whisper-medium', 'whisper-small'],
        audioSpeed: ['1.0', '1.3', '1.4', '1.5', '1.6', '1.7', '2.0'],
        selectedLanguage: ['en', 'ar'],
        selectedProvider: ['google', 'claude', 'haiku', 'sonnet', 'openrouter', 'webllm', 'koboldcpp'],
    };

    /** Load settings from localStorage, merged with defaults */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { ...DEFAULTS };
            const parsed = JSON.parse(raw);
            return { ...DEFAULTS, ...parsed };
        } catch (e) {
            console.error('Settings load error:', e);
            return { ...DEFAULTS };
        }
    }

    /** Save settings to localStorage */
    function save(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Settings save error:', e);
            return false;
        }
    }

    /** Reset to defaults */
    function reset() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
        return { ...DEFAULTS };
    }

    /** Get a single setting value */
    function get(key) {
        const s = load();
        return s[key];
    }

    /** Set a single setting value and save */
    function set(key, value) {
        const s = load();
        s[key] = value;
        return save(s);
    }

    /** Validate a settings object, return { valid, errors } */
    function validate(settings) {
        const errors = [];
        if (settings.aiMode && !VALID.aiMode.includes(settings.aiMode)) {
            errors.push('Invalid AI mode');
        }
        if (settings.whisperModel && !VALID.whisperModel.includes(settings.whisperModel)) {
            errors.push('Invalid whisper model');
        }
        if (settings.audioSpeed && !VALID.audioSpeed.includes(settings.audioSpeed)) {
            errors.push('Invalid audio speed');
        }
        if (settings.openrouterApiKey && !settings.openrouterApiKey.startsWith('sk-or-')) {
            errors.push('OpenRouter API key should start with "sk-or-"');
        }
        if (settings.googleApiKey && !/^AIza[0-9A-Za-z-_]{35}$/.test(settings.googleApiKey)) {
            errors.push('Google API key format looks invalid');
        }
        if (settings.claudeApiKey && !settings.claudeApiKey.startsWith('sk-')) {
            errors.push('Claude API key should start with "sk-"');
        }
        return { valid: errors.length === 0, errors };
    }

    /** Migrate old scattered localStorage keys to unified settings */
    function migrate() {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing) return; // Already migrated

        const oldSettings = {};
        // Old apiSettings JSON
        try {
            const oldApi = JSON.parse(localStorage.getItem('apiSettings') || '{}');
            if (oldApi.googleApiKey) oldSettings.googleApiKey = oldApi.googleApiKey;
            if (oldApi.claudeApiKey) oldSettings.claudeApiKey = oldApi.claudeApiKey;
            if (oldApi.openrouterApiKey) oldSettings.openrouterApiKey = oldApi.openrouterApiKey;
            if (oldApi.debugMode) oldSettings.debugMode = oldApi.debugMode;
        } catch (e) { /* ignore */ }

        // Scattered keys
        const keys = ['webllmModel', 'whisperModel', 'aiMode', 'cloudChatModel', 'cloudSttModel', 'audioSpeed', 'selectedLanguage', 'selectedProvider'];
        for (const k of keys) {
            const v = localStorage.getItem(k);
            if (v !== null) oldSettings[k] = v;
        }

        const merged = { ...DEFAULTS, ...oldSettings };
        save(merged);

        // Clean up old keys (keep apiSettings for backward compat during transition)
        // Don't delete old keys yet — let other modules read from Settings instead
        return merged;
    }

    /** Show/hide settings sections based on AI mode */
    function applyAIModeVisibility(mode) {
        const localSection = document.getElementById('settings-local');
        const cloudSection = document.getElementById('settings-cloud');

        if (localSection) {
            localSection.style.display = (mode === 'local' || mode === 'auto') ? '' : 'none';
        }
        if (cloudSection) {
            cloudSection.style.display = (mode === 'cloud' || mode === 'auto') ? '' : 'none';
        }
    }

    /** Populate form fields from settings */
    function populateForm() {
        const s = load();
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        const setChecked = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = val;
        };

        setVal('aiMode', s.aiMode);
        setVal('whisperModelSelect', s.whisperModel);
        setVal('webllmModelSelect', s.webllmModel);
        setVal('openrouterApiKey', s.openrouterApiKey);
        setVal('cloudChatModel', s.cloudChatModel);
        setVal('cloudSttModel', s.cloudSttModel);
        setVal('audioSpeed', s.audioSpeed);
        setVal('googleApiKey', s.googleApiKey);
        setVal('claudeApiKey', s.claudeApiKey);
        setChecked('debugMode', s.debugMode);

        applyAIModeVisibility(s.aiMode);
        updateModelInfoDisplays(s);
    }

    /** Collect form values into a settings object */
    function collectForm() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        const getChecked = (id) => {
            const el = document.getElementById(id);
            return el ? el.checked : false;
        };

        return {
            aiMode: getVal('aiMode'),
            whisperModel: getVal('whisperModelSelect'),
            webllmModel: getVal('webllmModelSelect'),
            openrouterApiKey: getVal('openrouterApiKey'),
            cloudChatModel: getVal('cloudChatModel'),
            cloudSttModel: getVal('cloudSttModel'),
            audioSpeed: getVal('audioSpeed'),
            googleApiKey: getVal('googleApiKey'),
            claudeApiKey: getVal('claudeApiKey'),
            debugMode: getChecked('debugMode'),
            // Preserve UI prefs that aren't in the form
            selectedLanguage: get('selectedLanguage'),
            selectedProvider: get('selectedProvider'),
        };
    }

    /** Update dynamic model info displays */
    function updateModelInfoDisplays(settings) {
        const WHISPER_INFO = {
            'whisper-medium': '<strong>⭐ whisper-medium (q4):</strong> 7/7 Arabic key words. ~680MB download (one-time). WebGPU required. Falls back to whisper-small on non-WebGPU browsers.',
            'whisper-small': '<strong>🎯 whisper-small (q8):</strong> 0/7 Arabic key words (gibberish quality). ~510MB download. Works on WASM (no WebGPU needed).',
        };
        const CLOUD_STT_INFO = {
            'openrouter-mai-transcribe': '<strong>🏆 Microsoft MAI-Transcribe 1.5:</strong> 2690 chars / 4min. 3.6s. $0.024. Proper Arabic punctuation (، . ؟). Best quality.',
            'openrouter-voxtral-mini': '<strong>🌿 Mistral Voxtral Mini:</strong> 2562 chars / 4min. 4.7s. $0.012. Good quality, no punctuation.',
            'openrouter-gpt-4o-transcribe': '<strong>☁️ GPT-4o Transcribe:</strong> 2636 chars / 4min. 11.5s. $0.014. Some punctuation.',
            'openrouter-gpt-4o-mini-transcribe': '<strong>☁️ GPT-4o Mini:</strong> 2573 chars / 4min. 10.7s. $0.007. Cheapest full transcript.',
            'openrouter-whisper-1': '<strong>☁️ Whisper 1:</strong> 2501 chars / 4min. 33.3s. $0.024. Original Whisper, slow.',
            'openrouter-whisper-large-v3': '<strong>⚠️ Whisper Large V3:</strong> 1154 chars / 4min. 3.3s. $0.006. Fast but TRUNCATES long audio.',
        };
        const AUDIO_SPEED_INFO = {
            '1.0': '<strong>1.0x (default):</strong> Full quality. 4-min audio = 7.3MB upload. No quality loss.',
            '1.3': '<strong>1.3x:</strong> 23% smaller upload, 99.4% quality retained.',
            '1.4': '<strong>1.4x:</strong> 29% smaller, 99.7% quality.',
            '1.5': '<strong>1.5x:</strong> 33% smaller, ~99.6% quality.',
            '1.6': '<strong>1.6x:</strong> 37% smaller, 99.6% quality.',
            '1.7': '<strong>1.7x:</strong> 41% smaller, 99.6% quality.',
            '2.0': '<strong>2.0x:</strong> 51% smaller, 99.1% quality.',
        };

        const whisperInfo = document.getElementById('whisperModelInfo');
        const whisperSelect = document.getElementById('whisperModelSelect');
        if (whisperInfo && whisperSelect) {
            whisperInfo.innerHTML = WHISPER_INFO[whisperSelect.value] || 'No info available.';
        }

        const cloudSttInfo = document.getElementById('cloudSttInfo');
        const cloudSttSelect = document.getElementById('cloudSttModel');
        if (cloudSttInfo && cloudSttSelect) {
            cloudSttInfo.innerHTML = CLOUD_STT_INFO[cloudSttSelect.value] || 'No info available.';
        }

        const audioSpeedInfo = document.getElementById('audioSpeedInfo');
        const audioSpeedSelect = document.getElementById('audioSpeed');
        if (audioSpeedInfo && audioSpeedSelect) {
            audioSpeedInfo.innerHTML = AUDIO_SPEED_INFO[audioSpeedSelect.value] || 'No info available.';
        }
    }

    /** Initialize the settings modal — call once on page load */
    function initModal() {
        const settingsModal = document.getElementById('settingsModal');
        const closeBtn = settingsModal?.querySelector('.close');
        const cancelBtn = document.getElementById('cancelSettings');
        const settingsForm = document.getElementById('settingsForm');
        const resetBtn = document.getElementById('resetSettings');
        const aiModeSelect = document.getElementById('aiMode');
        const debugMode = document.getElementById('debugMode');
        const debugPanel = document.getElementById('debug');

        if (!settingsModal || !settingsForm) return;

        const openModal = () => {
            populateForm();
            settingsModal.classList.add('is-active');
        };
        const closeModal = () => settingsModal.classList.remove('is-active');

        // Use event delegation for settingsBtn since it's loaded dynamically
        document.addEventListener('click', (e) => {
            if (e.target.matches('#settingsBtn') || e.target.closest('#settingsBtn')) {
                openModal();
            }
        });
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        const bg = settingsModal.querySelector('.modal-background');
        if (bg) bg.addEventListener('click', closeModal);

        // AI mode show/hide
        if (aiModeSelect) {
            aiModeSelect.addEventListener('change', () => {
                applyAIModeVisibility(aiModeSelect.value);
            });
        }

        // Update model info on select change
        const whisperSelect = document.getElementById('whisperModelSelect');
        if (whisperSelect) {
            whisperSelect.addEventListener('change', () => updateModelInfoDisplays(load()));
        }
        const cloudSttSelect = document.getElementById('cloudSttModel');
        if (cloudSttSelect) {
            cloudSttSelect.addEventListener('change', () => updateModelInfoDisplays(load()));
        }
        const audioSpeedSelect = document.getElementById('audioSpeed');
        if (audioSpeedSelect) {
            audioSpeedSelect.addEventListener('change', () => updateModelInfoDisplays(load()));
        }

        // Debug mode toggle
        if (debugMode && debugPanel) {
            debugMode.addEventListener('change', (e) => {
                debugPanel.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // Form submission
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const newSettings = collectForm();
            const { valid, errors } = validate(newSettings);

            if (!valid) {
                const currentLang = Settings.get('selectedLanguage') || 'en';
                const msg = errors.join('\n');
                if (window.showError) showError(msg);
                else alert(msg);
                return;
            }

            if (save(newSettings)) {
                // Unload WebLLM engine if model changed
                if (window.ChatLLM && ChatLLM.getLoadedModel() !== newSettings.webllmModel) {
                    ChatLLM.unload();
                }
                // Update whisper model preference
                if (window.Transcriber) {
                    Transcriber.setPreferredModel(newSettings.whisperModel);
                }
                // Update debug panel
                if (debugPanel) {
                    debugPanel.style.display = newSettings.debugMode ? 'block' : 'none';
                }
                // Show success
                const currentLang = newSettings.selectedLanguage || 'en';
                if (window.translations && translations[currentLang]) {
                    showStatus(translations[currentLang].settings.saved, 'success');
                } else {
                    showStatus('Settings saved successfully', 'success');
                }
                closeModal();
            } else {
                showError('Error saving settings');
            }
        });

        // Reset to defaults
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset all settings to defaults?')) {
                    const defaults = reset();
                    populateForm();
                    if (debugPanel) debugPanel.style.display = 'none';
                    showStatus('Settings reset to defaults', 'info');
                }
            });
        }
    }

    return {
        DEFAULTS,
        STORAGE_KEY,
        load,
        save,
        reset,
        get,
        set,
        validate,
        migrate,
        applyAIModeVisibility,
        populateForm,
        collectForm,
        updateModelInfoDisplays,
        initModal,
    };
})();

window.Settings = Settings;