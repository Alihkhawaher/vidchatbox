// UI Helper Functions
function showElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'block';
    }
}

function hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'none';
    }
}

function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

function disableButton(id, disabled) {
    const button = document.getElementById(id);
    if (button) {
        button.disabled = disabled;
        button.classList.toggle('is-loading', disabled);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `notification is-${type}`;
        statusDiv.style.display = 'block';
    }
}

function logDebug(message, data = null) {
    const settings = JSON.parse(localStorage.getItem('apiSettings') || '{}');
    if (!settings.debugMode) return;

    const debugPanel = document.querySelector('#debug .debug-content');
    if (!debugPanel) return;

    const timestamp = new Date().toISOString();
    const logEntry = document.createElement('div');
    logEntry.className = 'debug-entry';
    
    let logMessage = `[${timestamp}] ${message}`;
    if (data) {
        try {
            logMessage += '\n' + JSON.stringify(data, null, 2);
        } catch (e) {
            logMessage += '\n[Unable to stringify data]';
        }
    }
    
    logEntry.textContent = logMessage;
    debugPanel.appendChild(logEntry);
    debugPanel.scrollTop = debugPanel.scrollHeight;
}

// URL Helper Functions
function extractVideoId(url) {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : null;
}

// API Helper Functions
function getApiKey(provider) {
    const settings = JSON.parse(localStorage.getItem('apiSettings') || '{}');
    switch (provider.toLowerCase()) {
        case 'google':
            return settings.googleApiKey;
        case 'claude':
        case 'haiku':
        case 'sonnet':
            return settings.claudeApiKey;
        default:
            return null;
    }
}

// Language Helper Functions
function updateUILanguage(lang) {
    if (!window.translations || !window.translations[lang]) {
        console.error('Translations not found for language:', lang);
        return;
    }

    // Update all elements with data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        const keys = key.split('.');
        let translation = window.translations[lang];
        
        // Navigate through nested translation objects
        for (const k of keys) {
            if (translation && translation[k]) {
                translation = translation[k];
            } else {
                console.warn(`Translation not found for key: ${key}`);
                return;
            }
        }
        
        if (typeof translation === 'string') {
            element.textContent = translation;
        }
    });

    // Update document direction
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.className = lang === 'ar' ? 'rtl' : 'ltr';
    
    // Toggle RTL stylesheet
    const rtlStylesheet = document.querySelector('link[href*="bulma-rtl"]');
    if (rtlStylesheet) {
        rtlStylesheet.disabled = lang !== 'ar';
    }
}

// Export functions for use in other modules
window.showElement = showElement;
window.hideElement = hideElement;
window.setElementText = setElementText;
window.disableButton = disableButton;
window.showError = showError;
window.showStatus = showStatus;
window.logDebug = logDebug;
window.extractVideoId = extractVideoId;
window.getApiKey = getApiKey;
window.updateUILanguage = updateUILanguage;
