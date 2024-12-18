// Initialize event listeners when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for Enter key in chat input
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent newline
                sendMessage();
            }
        });
    }

    // Add event listener for toggle debug button
    const toggleDebugBtn = document.getElementById('toggleDebugBtn');
    const debugDiv = document.getElementById('debug');
    if (toggleDebugBtn && debugDiv) {
        toggleDebugBtn.addEventListener('click', () => {
            debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
        });
    }
});
