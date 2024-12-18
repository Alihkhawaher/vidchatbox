const axios = require('axios');
require('dotenv').config();

const api_key = process.env.CLAUDE_API_KEY;
if (!api_key) {
    console.error('CLAUDE_API_KEY not found in environment variables');
}

const MODELS = {
    'claude': 'claude-3-opus-20240229',
    'haiku': 'claude-3-haiku-20240307',
    'sonnet': 'claude-3-sonnet-20240229'
};

function trimCaptions(captions) {
    // Remove timestamps and limit length
    const cleanCaptions = captions.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
    const maxLength = 12000; // Reasonable size for context
    if (cleanCaptions.length > maxLength) {
        return cleanCaptions.substring(0, maxLength) + '... (truncated)';
    }
    return cleanCaptions;
}

async function generateResponse(message, captions, model = 'claude') {
    try {
        if (!api_key) {
            throw new Error('Claude API key not configured');
        }

        const selectedModel = MODELS[model] || MODELS.claude;
        const trimmedCaptions = trimCaptions(captions);

        const headers = {
            "x-api-key": api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        };

        const data = {
            "model": selectedModel,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": `Video Context:\n${trimmedCaptions}\n\nUser Question: ${message}`
                        }
                    ]
                }
            ],
            "max_tokens": 4096
        };

        const response = await axios.post("https://api.anthropic.com/v1/messages", data, { headers });
        
        if (!response.data.content || !response.data.content[0] || !response.data.content[0].text) {
            throw new Error('Invalid response format from Claude API');
        }

        return {
            type: 'final',
            markdown: response.data.content[0].text,
            html: response.data.content[0].text
        };
    } catch (error) {
        console.error('Claude API error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        return {
            type: 'error',
            error: error.response?.data?.error || {
                type: error.response?.status === 401 ? 'authentication_error' : 'api_error',
                message: error.response?.data?.error?.message || error.message || 'Failed to generate response'
            }
        };
    }
}

module.exports = { generateResponse, MODELS };
