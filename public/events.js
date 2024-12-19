// Event handling for video URL submission
document.addEventListener('submit', async (e) => {
    if (e.target.matches('#videoForm')) {
        e.preventDefault();
        await handleSubmit();
    }
});

// Event handling for chat input
document.addEventListener('submit', async (e) => {
    if (e.target.matches('#chatForm')) {
        e.preventDefault();
        await sendMessage();
    }
});

// Event handling for timestamp clicks
document.addEventListener('click', (e) => {
    if (e.target.matches('.timestamp')) {
        const timestamp = e.target.textContent.replace(/[\[\]]/g, '');
        const [hours, minutes, seconds] = timestamp.split(':').map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        // Log timestamp click
        logDebug(`Timestamp clicked: ${timestamp} (${totalSeconds} seconds)`);
        
        // You could implement timestamp-specific functionality here
        // For example, scrolling to that part of the video if implemented
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

// Event handling for provider selection
document.addEventListener('change', (e) => {
    if (e.target.matches('#providerSelect')) {
        const provider = e.target.value;
        const apiKey = getApiKey(provider);
        const currentLang = document.documentElement.lang || 'en';
        
        // Check if API key is required and not set
        if (['google', 'claude', 'haiku', 'sonnet'].includes(provider) && !apiKey) {
            showError(translations[currentLang].errors.apiKeyRequired);
            // Reset to default provider
            e.target.value = 'koboldcpp';
        }
        
        logDebug(`Provider changed to: ${provider}`);
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
