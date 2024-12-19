const axios = require('axios');
const { validateApiKey, handleApiError } = require('../utils/api-utils');
const ProviderUtils = require('../utils/provider-utils');

class GoogleProvider {
    static API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

    static async generateResponse(message, captions, userApiKey = null) {
        try {
            const apiKey = userApiKey || process.env.GOOGLE_API_KEY;
            validateApiKey(apiKey, 'Google');

            const prompt = ProviderUtils.preparePrompt(message, captions);

            const response = await axios.post(
                `${this.API_ENDPOINT}?key=${apiKey}`,
                {
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (!response.data.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error('Invalid response format from Google Gemini API');
            }

            return ProviderUtils.formatMarkdownResponse(response.data.candidates[0].content.parts[0].text);

        } catch (error) {
            return handleApiError(error, 'Google');
        }
    }
}

module.exports = {
    generateResponse: GoogleProvider.generateResponse.bind(GoogleProvider)
};
