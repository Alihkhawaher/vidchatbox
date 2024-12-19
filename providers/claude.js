const axios = require('axios');
const { validateApiKey, handleApiError } = require('../utils/api-utils');
const ProviderUtils = require('../utils/provider-utils');

class ClaudeProvider {
    static MODELS = {
        claude: 'claude-3-opus-20240229',
        haiku: 'claude-3-haiku-20240307',
        sonnet: 'claude-3-sonnet-20240229'
    };

    static getModel(provider) {
        return this.MODELS[provider] || this.MODELS.claude;
    }

    static async generateResponse(message, captions, provider, userApiKey = null) {
        try {
            const apiKey = userApiKey || process.env.CLAUDE_API_KEY;
            validateApiKey(apiKey, 'Claude');

            const prompt = ProviderUtils.preparePrompt(message, captions);
            const model = this.getModel(provider);

            const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model,
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: prompt }]
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

module.exports = {
    generateResponse: ClaudeProvider.generateResponse.bind(ClaudeProvider)
};
