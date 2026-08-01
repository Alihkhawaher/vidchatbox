const express = require('express');
const router = express.Router();
const koboldcpp = require('../providers/koboldcpp');
const claude = require('../providers/claude');
const google = require('../providers/google');
const openrouter = require('../providers/openrouter');
const { ApiError, ErrorTypes } = require('../utils/api-utils');

class ChatService {
    static VALID_PROVIDERS = ['koboldcpp', 'claude', 'haiku', 'sonnet', 'google', 'openrouter'];

    static validateRequest(message, provider) {
        if (!message?.trim()) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Message is required', 400);
        }
        if (!this.VALID_PROVIDERS.includes(provider)) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Invalid provider selected', 400);
        }
    }

    static async generateResponse(message, captions, provider, userApiKey, model, history = []) {
        let response;
        
        switch (provider) {
            case 'koboldcpp':
                response = await koboldcpp.generateResponse(message, captions || '', history);
                break;
            
            case 'claude':
            case 'haiku':
            case 'sonnet':
                // Use server API key as fallback if no user API key provided
                const apiKey = userApiKey || process.env.CLAUDE_API_KEY;
                response = await claude.generateResponse(message, captions || '', provider, apiKey, history);
                break;
            
            case 'google':
                // Use server API key as fallback if no user API key provided
                const googleKey = userApiKey || process.env.GOOGLE_API_KEY;
                response = await google.generateResponse(message, captions || '', googleKey, history);
                break;
            
            case 'openrouter':
                response = await openrouter.generateResponse(message, captions || '', userApiKey, model, history);
                break;
            
            default:
                throw new ApiError(ErrorTypes.VALIDATION, 'Invalid provider selected', 400);
        }

        return response;
    }
}

// Initial chat request with streaming
router.post('/', async (req, res) => {
    const { message, captions, provider, model, history = [] } = req.body;
    const userApiKey = req.headers['x-api-key'];

    try {
        // Validate request
        ChatService.validateRequest(message, provider);

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Handle streaming for Koboldcpp
        if (provider === 'koboldcpp') {
            await koboldcpp.generateResponse(message, captions || '', history, (streamResponse) => {
                if (!res.writableEnded) res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
                
                if (['final', 'error'].includes(streamResponse.type) && !res.writableEnded) {
                    res.end();
                }
            });
            return;
        }

        if (provider === 'openrouter') {
            const response = await openrouter.generateResponse(message, captions || '', userApiKey, model, history, (streamResponse) => {
                if (!res.writableEnded) res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
                if (['final', 'error'].includes(streamResponse.type) && !res.writableEnded) res.end();
            });
            if (!res.writableEnded && response?.type === 'error') {
                res.write(`data: ${JSON.stringify(response)}\n\n`);
                res.end();
            }
            return;
        }

        // Handle other providers
        const response = await ChatService.generateResponse(message, captions, provider, userApiKey, model, history);
        
        // Only send successful responses, not error-shaped objects
        if (response.type === 'error') {
            res.write(`data: ${JSON.stringify(response)}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify(response)}\n\n`);
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

module.exports = router;
