const axios = require('axios');
const { handleApiError } = require('../utils/api-utils');
const ProviderUtils = require('../utils/provider-utils');
const { marked } = require('marked');

// Configure marked for safe HTML
marked.setOptions({
    headerIds: false,
    mangle: false,
    breaks: true
});

class OpenRouterProvider extends ProviderUtils.BaseProvider {
    static name = 'OpenRouter';
    
    static API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

    static MODELS = {
        'openrouter': 'anthropic/claude-sonnet-4',  // Default model
    };

    static getEnvKeyName() {
        return 'OPENROUTER_API_KEY';
    }

    static hasServerKey() {
        return !!process.env[this.getEnvKeyName()];
    }

    static validateKey(key) {
        if (!key || typeof key !== 'string' || !key.startsWith('sk-or-')) {
            throw new Error('Invalid OpenRouter API key format');
        }
    }

    static async checkKeyValidity(key) {
        try {
            const response = await axios.post(
                this.API_ENDPOINT,
                {
                    model: 'anthropic/claude-sonnet-4',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'test' }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                        'HTTP-Referer': 'https://vidchatbox.technlov.com',
                        'X-Title': 'VidChatBox'
                    }
                }
            );
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    static async generateResponse(context, _, model, apiKey) {
        if (!apiKey) {
            return {
                type: 'error',
                error: {
                    type: 'API_KEY_MISSING',
                    message: 'OpenRouter API key is required'
                }
            };
        }

        try {
            const response = await axios.post(
                this.API_ENDPOINT,
                {
                    model: model || 'anthropic/claude-sonnet-4',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant that can discuss YouTube video content. Format responses in markdown. Use ## for headers, - for bullet points, and **text** for emphasis. Be concise but thorough.'
                        },
                        {
                            role: 'user',
                            content: context
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4096,
                    stream: false
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': 'https://vidchatbox.technlov.com',
                        'X-Title': 'VidChatBox'
                    }
                }
            );

            const content = response.data.choices[0].message.content;
            const htmlContent = marked(content);

            return {
                type: 'chunk',
                html: htmlContent,
                markdown: content
            };
        } catch (error) {
            console.error('OpenRouter API error:', error.response?.data || error.message);
            return handleApiError(error, 'OpenRouter');
        }
    }
}

// Express router for key validation
const express = require('express');
const router = express.Router();

router.post('/validate-key', async (req, res) => {
    const { apiKey } = req.body;
    try {
        OpenRouterProvider.validateKey(apiKey);
        const isValid = await OpenRouterProvider.checkKeyValidity(apiKey);
        res.json({ valid: isValid });
    } catch (error) {
        res.json({ valid: false, error: error.message });
    }
});

router.get('/has-key', (req, res) => {
    res.json({ hasKey: OpenRouterProvider.hasServerKey() });
});

// Endpoint to check API key status (matches Claude/Google pattern)
router.get('/status', async (req, res) => {
    const userKey = OpenRouterProvider.getKeyFromRequest(req);
    try {
        const hasValidKey = userKey ? await OpenRouterProvider.checkKeyValidity(userKey) : false;
        res.json({
            hasServerKey: OpenRouterProvider.hasServerKey(),
            hasValidUserKey: hasValidKey
        });
    } catch (error) {
        res.json({
            hasServerKey: OpenRouterProvider.hasServerKey(),
            hasValidUserKey: false,
            error: error.message
        });
    }
});

module.exports = { OpenRouterProvider, router };