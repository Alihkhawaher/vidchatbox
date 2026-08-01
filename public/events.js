// Provider API key management
const ProviderManager = {
    async checkProviderStatus(provider, userKey = null) {
        try {
            const headers = userKey ? { 'x-api-key': userKey } : {};
            const response = await fetch(`/api/providers/${provider}/status`, { headers });
            return await response.json();
        } catch (error) {
            console.error(`Error checking ${provider} status:`, error);
            return { hasServerKey: false, hasValidUserKey: false, error: error.message };
        }
    },

    async updateProviderUI(provider) {
        const settings = JSON.parse(localStorage.getItem('apiSettings') || '{}');
        const userKey = settings[`${provider}ApiKey`];
        const status = await this.checkProviderStatus(provider, userKey);
        
        // Update input field if it exists
        const inputField = document.getElementById(`${provider}ApiKey`);
        if (inputField) {
            // Remove existing help message
            inputField.parentElement.querySelector('.help')?.remove();
            
            // Add appropriate help message (using textContent to prevent XSS)
            if (status.hasServerKey) {
                const helpEl = document.createElement('p');
                helpEl.className = 'help is-info';
                helpEl.textContent = 'Server API key available. You can still use your own key if preferred.';
                inputField.parentElement.appendChild(helpEl);
            } else if (status.error) {
                const helpEl = document.createElement('p');
                helpEl.className = 'help is-danger';
                helpEl.textContent = status.error; // textContent, not innerHTML — prevents XSS
                inputField.parentElement.appendChild(helpEl);
            }
        }

        return status;
    }
};

// Initialize provider API keys
async function initializeServerApiKeys() {
    const providerSelect = document.getElementById('providerSelect');
    if (!providerSelect) return;

    const currentProvider = providerSelect.value;
    const status = await ProviderManager.updateProviderUI(currentProvider);
    
    logDebug('Provider status initialized:', {
        provider: currentProvider,
        status
    });

    return status;
}

// Event handling for settings modal — use .closest() for child element targeting
document.addEventListener('click', async (e) => {
    if (e.target.closest('#settingsBtn') || e.target.closest('#settingsBtnHome')) {
        // Remove any existing help messages
        document.querySelectorAll('.field .help').forEach(el => el.remove());
        
        // Check status for all providers
        await Promise.all(['claude', 'google'].map(provider => 
            ProviderManager.updateProviderUI(provider)
        ));
    }
});

// Initialize provider status when page loads
document.addEventListener('DOMContentLoaded', async () => {
    await initializeServerApiKeys();
});

// Handle provider selection changes (consolidated — single handler)
document.addEventListener('change', async (e) => {
    if (e.target.matches('#providerSelect')) {
        const provider = e.target.value;
        logDebug(`Provider changed to: ${provider}`);
        await ProviderManager.updateProviderUI(provider);
    }
});

// Note: chatForm submit and chatInput Enter key handlers are in main.js
// (avoiding duplicate handlers that would call sendMessage() twice)

// Event handling for timestamp clicks
document.addEventListener('click', (e) => {
    if (e.target.matches('.timestamp')) {
        const timestamp = e.target.textContent.replace(/[\[\]]/g, '');
        const [hours, minutes, seconds] = timestamp.split(':').map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        logDebug(`Timestamp clicked: ${timestamp} (${totalSeconds} seconds)`);
    }
});

// Event handling for copy buttons
document.addEventListener('click', (e) => {
    if (e.target.matches('.copy-button')) {
        const textToCopy = e.target.getAttribute('data-copy');
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    const originalText = e.target.textContent;
                    e.target.textContent = translations[document.documentElement.lang || 'en'].install.copied;
                    setTimeout(() => {
                        e.target.textContent = originalText;
                    }, 2000);
                })
                .catch(() => {
                    showError(translations[document.documentElement.lang || 'en'].install.copyError);
                });
        }
    }
});

// Event handling for debug panel
document.addEventListener('click', (e) => {
    if (e.target.matches('#clearDebug')) {
        const debugContent = document.querySelector('#debug .debug-content');
        if (debugContent) {
            debugContent.innerHTML = '';
            showStatus(translations[document.documentElement.lang || 'en'].diagnostics.debugLog.cleared, 'success');
        }
    } else if (e.target.matches('#copyDebug')) {
        const debugContent = document.querySelector('#debug .debug-content');
        if (debugContent) {
            navigator.clipboard.writeText(debugContent.textContent)
                .then(() => {
                    showStatus(translations[document.documentElement.lang || 'en'].diagnostics.debugLog.copied, 'success');
                })
                .catch((error) => {
                    console.error('Failed to copy debug log:', error);
                    showError(translations[document.documentElement.lang || 'en'].install.copyError);
                });
        }
    }
});

// Event handling for language selection
document.addEventListener('change', (e) => {
    if (e.target.matches('#languageSelect')) {
        const selectedLang = e.target.value;
        logDebug(`Language changed to: ${selectedLang}`);
        
        // Dispatch custom event for router to handle
        const event = new CustomEvent('languageChanged', {
            detail: { language: selectedLang }
        });
        document.dispatchEvent(event);
    }
});