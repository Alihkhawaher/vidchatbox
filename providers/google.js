const axios = require('axios');
require('dotenv').config();

const api_key = process.env.GOOGLE_API_KEY;
if (!api_key) {
    console.error('GOOGLE_API_KEY not found in environment variables');
}

function trimCaptions(captions) {
    // Remove timestamps and limit length
    const cleanCaptions = captions.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
    const maxLength = 12000; // Reasonable size for context
    if (cleanCaptions.length > maxLength) {
        return cleanCaptions.substring(0, maxLength) + '... (truncated)';
    }
    return cleanCaptions;
}

async function generateResponse(message, captions) {
    try {
        if (!api_key) {
            throw new Error('Google API key not configured');
        }

        const trimmedCaptions = trimCaptions(captions);

        const headers = {
            "Content-Type": "application/json",
        };

        const data = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": `Video Context:\n${trimmedCaptions}\n\nUser Question: ${message}`
                        }
                    ]
                }
            ]
        };

        // Placeholder for Google Gemini API call
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${api_key}`, data, { headers });

        if (!response.data.candidates || !response.data.candidates[0] || !response.data.candidates[0].content || !response.data.candidates[0].content.parts || !response.data.candidates[0].content.parts[0].text) {
            throw new Error('Invalid response format from Google Gemini API');
        }

        return {
            type: 'final',
            markdown: response.data.candidates[0].content.parts[0].text,
            html: response.data.candidates[0].content.parts[0].text
        };
    } catch (error) {
         console.error('Google Gemini API error:', {
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

module.exports = { generateResponse };
