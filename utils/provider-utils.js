const { marked } = require('marked');
const { ApiError, ErrorTypes } = require('./api-utils');

// Configure marked for safe HTML
marked.setOptions({
    headerIds: false,
    mangle: false,
    breaks: true
});

class BaseProvider {
    static hasServerKey() {
        throw new Error('hasServerKey() must be implemented by provider');
    }

    static validateKey(key) {
        throw new Error('validateKey() must be implemented by provider');
    }

    static async checkKeyValidity(key) {
        throw new Error('checkKeyValidity() must be implemented by provider');
    }

    static getKeyFromRequest(req) {
        return req.headers['x-api-key'];
    }

    static async getValidKey(userKey) {
        // Try user key first
        if (userKey) {
            this.validateKey(userKey);
            return userKey;
        }

        // Fall back to server key if available
        const serverKey = process.env[this.getEnvKeyName()];
        if (serverKey) {
            this.validateKey(serverKey);
            return serverKey;
        }

        throw new ApiError(
            ErrorTypes.AUTHENTICATION,
            `No valid API key available for ${this.name}`,
            401
        );
    }
}

class ProviderUtils {
    static MAX_CAPTION_LENGTH = 12000;
    static BaseProvider = BaseProvider;

    static trimCaptions(captions) {
        const cleanCaptions = captions.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        if (cleanCaptions.length > this.MAX_CAPTION_LENGTH) {
            return cleanCaptions.substring(0, this.MAX_CAPTION_LENGTH) + '... (truncated)';
        }
        return cleanCaptions;
    }

    static formatMarkdownResponse(text) {
        return {
            type: 'final',
            html: marked(text),
            markdown: text
        };
    }

    static preparePrompt(message, captions) {
        const trimmedCaptions = this.trimCaptions(captions);
        return `Video Context:\n${trimmedCaptions}\n\nUser Question: ${message}`;
    }
}

module.exports = ProviderUtils;
