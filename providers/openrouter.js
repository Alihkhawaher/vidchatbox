const axios = require('axios');
const { handleApiError } = require('../utils/api-utils');
const ProviderUtils = require('../utils/provider-utils');

class OpenRouterProvider extends ProviderUtils.BaseProvider {
    static name = 'OpenRouter';

    static API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

    static async generateResponse(message, captions, userApiKey, model, history = [], onChunk = null) {
        try {
            const apiKey = userApiKey || process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                throw new Error('OpenRouter API key is required');
            }

            const chatModel = model || 'openai/gpt-4o-mini';

            const messages = [
                { role: 'system', content: ProviderUtils.prepareSystemPrompt(captions) },
                ...ProviderUtils.sanitizeHistory(history),
                { role: 'user', content: message }
            ];

            const response = await axios.post(
                this.API_ENDPOINT,
                {
                    model: chatModel,
                    messages,
                    max_tokens: 2048,
                    stream: Boolean(onChunk),
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': process.env.APP_URL,
                        'X-Title': 'VidChatBox'
                    },
                    responseType: onChunk ? 'stream' : 'json'
                }
            );

            if (onChunk) {
                let buffer = '';
                let fullContent = '';
                for await (const chunk of response.data) {
                    buffer += chunk.toString('utf8');
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;
                        const payload = trimmed.replace(/^data:\s*/, '');
                        if (!payload || payload === '[DONE]') continue;
                        let data;
                        try {
                            data = JSON.parse(payload);
                        } catch (parseError) {
                            console.warn('OpenRouter stream parse warning:', parseError.message);
                            continue;
                        }
                        const delta = data.choices?.[0]?.delta?.content || '';
                        if (!delta) continue;
                        fullContent += delta;
                        onChunk({ type: 'chunk', content: delta, markdown: fullContent });
                    }
                }
                const finalResponse = ProviderUtils.formatMarkdownResponse(fullContent);
                onChunk(finalResponse);
                return finalResponse;
            }

            const text = response.data?.choices?.[0]?.message?.content;
            if (!text) {
                throw new Error('Invalid response format from OpenRouter API');
            }

            return ProviderUtils.formatMarkdownResponse(text);

        } catch (error) {
            const errorResponse = handleApiError(error, 'OpenRouter');
            if (onChunk) onChunk(errorResponse);
            return errorResponse;
        }
    }
}

module.exports = {
    generateResponse: OpenRouterProvider.generateResponse.bind(OpenRouterProvider),
};