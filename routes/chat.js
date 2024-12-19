const express = require('express');
const router = express.Router();
const koboldcpp = require('../providers/koboldcpp');
const claude = require('../providers/claude');
const google = require('../providers/google');
const { ApiError, ErrorTypes } = require('../utils/api-utils');

class ChatService {
    static MAX_HISTORY = 10;
    static VALID_PROVIDERS = ['koboldcpp', 'claude', 'haiku', 'sonnet', 'google'];
    
    static chatHistory = [];

    static validateRequest(message, provider) {
        if (!message?.trim()) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Message is required', 400);
        }
        if (!this.VALID_PROVIDERS.includes(provider)) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Invalid provider selected', 400);
        }
    }

    static addToHistory(role, content) {
        this.chatHistory.push({ role, content });
        if (this.chatHistory.length > this.MAX_HISTORY) {
            this.chatHistory = this.chatHistory.slice(-this.MAX_HISTORY);
        }
    }

    static clearHistory() {
        this.chatHistory = [];
    }

    static async generateResponse(message, captions, provider, apiKey) {
        let response;
        const context = captions?.trim() ? `Context from video captions:\n${captions}\n\nUser message: ${message}` : message;
        
        switch (provider) {
            case 'koboldcpp':
                response = await koboldcpp.generateResponse(message, captions || '');
                break;
            
            case 'claude':
            case 'haiku':
            case 'sonnet':
                response = await claude.generateResponse(context, '', provider, apiKey);
                break;
            
            case 'google':
                response = await google.generateResponse(context, '', apiKey);
                break;
            
            default:
                throw new ApiError(ErrorTypes.VALIDATION, 'Invalid provider selected', 400);
        }

        return response;
    }
}

// Initial chat request with streaming
router.post('/', async (req, res) => {
    const { message, captions, provider } = req.body;
    const userApiKey = req.headers['x-api-key'];

    try {
        // Validate request
        ChatService.validateRequest(message, provider);

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Add user message to history
        ChatService.addToHistory('user', message);

        // Handle streaming for Koboldcpp
        if (provider === 'koboldcpp') {
            await koboldcpp.generateResponse(message, captions || '', (streamResponse) => {
                res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
                
                if (streamResponse.type === 'final') {
                    ChatService.addToHistory('assistant', streamResponse.markdown);
                    res.end();
                }
            });
            return;
        }

        // Handle other providers
        const response = await ChatService.generateResponse(message, captions, provider, userApiKey);
        res.write(`data: ${JSON.stringify(response)}\n\n`);
        
        if (response.type === 'final') {
            ChatService.addToHistory('assistant', response.markdown);
        }
        res.end();

    } catch (error) {
        console.error('Chat error:', error);
        
        const errorResponse = {
            type: 'error',
            error: {
                type: error instanceof ApiError ? error.type : ErrorTypes.SERVER,
                message: error.message
            }
        };

        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
    }
});

// Clear chat history
router.post('/clear', (req, res) => {
    ChatService.clearHistory();
    res.json({ message: 'Chat history cleared' });
});

module.exports = router;
