const { marked } = require('marked');

// Configure marked for safe HTML
marked.setOptions({
    headerIds: false,
    mangle: false,
    breaks: true
});

class ProviderUtils {
    static MAX_CAPTION_LENGTH = 12000;

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
