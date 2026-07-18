const axios = require('axios');
const { handleApiError } = require('../utils/api-utils');
const ProviderUtils = require('../utils/provider-utils');

class GoogleProvider extends ProviderUtils.BaseProvider {
    static name = 'Google';
    
    static getEnvKeyName() {
        return 'GOOGLE_API_KEY';
    }

    static hasServerKey() {
        return !!process.env[this.getEnvKeyName()];
    }

    static validateKey(key) {
        if (!key || typeof key !== 'string' || !/^AIza[0-9A-Za-z-_]{35}$/.test(key)) {
            throw new Error('Invalid Google API key format');
        }
    }

    static async checkKeyValidity(key) {
        try {
            const response = await axios.post(
                `${this.API_ENDPOINT}?key=${key}`,
                {
                    contents: [{
                        parts: [{ text: 'test' }]
                    }]
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    static API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

    static async generateResponse(message, captions, userApiKey = null) {
        try {
            const apiKey = await this.getValidKey(userApiKey);

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

// Add router for provider-specific endpoints
const express = require('express');
const router = express.Router();

// Endpoint to check API key status
router.get('/status', async (req, res) => {
    const userKey = GoogleProvider.getKeyFromRequest(req);
    try {
        const hasValidKey = userKey ? await GoogleProvider.checkKeyValidity(userKey) : false;
        res.json({
            hasServerKey: GoogleProvider.hasServerKey(),
            hasValidUserKey: hasValidKey
        });
    } catch (error) {
        res.json({
            hasServerKey: GoogleProvider.hasServerKey(),
            hasValidUserKey: false,
            error: error.message
        });
    }
});

module.exports = {
    generateResponse: GoogleProvider.generateResponse.bind(GoogleProvider),
    router
};
