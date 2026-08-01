const axios = require('axios');
const { handleApiError } = require('../utils/api-utils');
const ProviderUtils = require('../utils/provider-utils');

class ClaudeProvider extends ProviderUtils.BaseProvider {
    static name = 'Claude';
    
    static getEnvKeyName() {
        return 'CLAUDE_API_KEY';
    }

    static hasServerKey() {
        return !!process.env[this.getEnvKeyName()];
    }

    static validateKey(key) {
        if (!key || typeof key !== 'string' || !key.startsWith('sk-')) {
            throw new Error('Invalid Claude API key format');
        }
    }

    static async checkKeyValidity(key) {
        try {
            const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model: this.MODELS.claude,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'test' }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01'
                    }
                }
            );
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    static MODELS = {
        claude: 'claude-3-opus-20240229',
        haiku: 'claude-3-haiku-20240307',
        sonnet: 'claude-3-sonnet-20240229'
    };

    static getModel(provider) {
        return this.MODELS[provider] || this.MODELS.claude;
    }

    static async generateResponse(message, captions, provider, userApiKey = null, history = []) {
        try {
            const apiKey = await this.getValidKey(userApiKey);

            const model = this.getModel(provider);
            const messages = [
                ...ProviderUtils.sanitizeHistory(history),
                { role: 'user', content: message }
            ];

            const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model,
                    max_tokens: 4096,
                    system: ProviderUtils.prepareSystemPrompt(captions),
                    messages
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    }
                }
            );

            if (!response.data.content?.[0]?.text) {
                throw new Error('Invalid response format from Claude API');
            }

            return ProviderUtils.formatMarkdownResponse(response.data.content[0].text);

        } catch (error) {
            return handleApiError(error, 'Claude');
        }
    }
}

// Add router for provider-specific endpoints
const express = require('express');
const router = express.Router();

// Endpoint to check API key status
router.get('/status', async (req, res) => {
    const userKey = ClaudeProvider.getKeyFromRequest(req);
    try {
        const hasValidKey = userKey ? await ClaudeProvider.checkKeyValidity(userKey) : false;
        res.json({
            hasServerKey: ClaudeProvider.hasServerKey(),
            hasValidUserKey: hasValidKey
        });
    } catch (error) {
        res.json({
            hasServerKey: ClaudeProvider.hasServerKey(),
            hasValidUserKey: false,
            error: error.message
        });
    }
});

module.exports = {
    generateResponse: ClaudeProvider.generateResponse.bind(ClaudeProvider),
    router
};
