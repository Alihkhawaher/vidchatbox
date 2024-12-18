const fetch = require('node-fetch');
const { marked } = require('marked');

// Configure marked for safe HTML
marked.setOptions({
    headerIds: false,
    mangle: false,
    breaks: true
});

// KoboldCPP endpoint configuration
const KOBOLD_BASE = 'http://localhost:5001';
const STREAM_ENDPOINT = `${KOBOLD_BASE}/api/extra/generate/stream`;

// Initial chat request with streaming
async function generateResponse(message, captions, callback) {
    try {
        // Prepare the context with captions and message
        const prompt = `${captions}\n\nHuman: ${message}\nAssistant:`;

        // Prepare the request for KoboldCPP
        const koboldRequest = {
            prompt: prompt,
            max_context_length: 16000,
            max_length: 800,
            temperature: 0.7,
            top_p: 0.9
        };

        console.log('Starting streaming generation...');
        const response = await fetch(STREAM_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(koboldRequest)
        });

        if (!response.ok) {
            throw new Error(`KoboldCPP API responded with status: ${response.status}`);
        }

        let currentText = '';

        // Process the stream
        for await (const chunk of response.body) {
            const lines = chunk.toString().split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.token) {
                            currentText += data.token;
                            const formattedHtml = marked(currentText.trim());
                            
                            callback({
                                type: 'chunk',
                                html: formattedHtml,
                                markdown: currentText.trim()
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }

        // Send final message
        if (currentText) {
            const formattedHtml = marked(currentText.trim());
            console.log('Sending final message...');
            callback({
                type: 'final',
                html: formattedHtml,
                markdown: currentText.trim()
            });
        }

    } catch (error) {
        console.error('Chat error:', error);
        callback({
            type: 'error',
            error: error.message
        });
    }
}

module.exports = { generateResponse };
