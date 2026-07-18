const express = require('express');
const router = express.Router();
const koboldcpp = require('../providers/koboldcpp');
const claude = require('../providers/claude');
const google = require('../providers/google');
const { ApiError, ErrorTypes } = require('../utils/api-utils');

class ChatService {
    static VALID_PROVIDERS = ['koboldcpp', 'claude', 'haiku', 'sonnet', 'google'];

    static validateRequest(message, provider) {
        if (!message?.trim()) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Message is required', 400);
        }
        if (!this.VALID_PROVIDERS.includes(provider)) {
            throw new ApiError(ErrorTypes.VALIDATION, 'Invalid provider selected', 400);
        }
    }

    static async generateResponse(message, captions, provider, userApiKey) {
        let response;
        const context = captions?.trim() ? `Context from video captions:\n${captions}\n\nUser message: ${message}` : message;
        
        switch (provider) {
            case 'koboldcpp':
                response = await koboldcpp.generateResponse(message, captions || '');
                break;
            
            case 'claude':
            case 'haiku':
            case 'sonnet':
                // Use server API key as fallback if no user API key provided
                const apiKey = userApiKey || process.env.CLAUDE_API_KEY;
                response = await claude.generateResponse(context, '', provider, apiKey);
                break;
            
            case 'google':
                // Use server API key as fallback if no user API key provided
                const googleKey = userApiKey || process.env.GOOGLE_API_KEY;
                response = await google.generateResponse(context, '', googleKey);
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

        // Handle streaming for Koboldcpp
        if (provider === 'koboldcpp') {
            await koboldcpp.generateResponse(message, captions || '', (streamResponse) => {
                res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
                
                if (streamResponse.type === 'final') {
                    res.end();
                }
            });
            return;
        }

        // Handle other providers
        const response = await ChatService.generateResponse(message, captions, provider, userApiKey);
        
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
