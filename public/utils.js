function setElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

function translateElement(elementId, lang) {
    const element = document.getElementById(elementId);
    if (element && translations[lang] && translations[lang][elementId]) {
        element.textContent = translations[lang][elementId];
    }
}

function translatePlaceholder(elementId, lang) {
    const element = document.getElementById(elementId);
     if (element && translations[lang] && translations[lang][elementId + 'Placeholder']) {
        element.placeholder = translations[lang][elementId + 'Placeholder'];
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
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
    }
}

function hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
    }
}

function showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'block';
    }
}

function disableButton(buttonId, disabled) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = disabled;
    }
}

function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

function logDebug(message) {
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        const timestamp = new Date().toISOString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        debugDiv.appendChild(logEntry);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
    console.log(message);
}
