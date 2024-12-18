const express = require('express');
const router = express.Router();
const koboldcpp = require('../providers/koboldcpp');
const claude = require('../providers/claude');
const google = require('../providers/google');

// Store chat history
let chatHistory = [];

// Initial chat request with streaming
router.post('/', async (req, res) => {
    const { message, captions, provider } = req.body;

    try {
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Add user message to history
        chatHistory.push({ role: 'user', content: message });

        // Select provider and handle streaming
        if (provider === 'koboldcpp') {
            await koboldcpp.generateResponse(message, captions, (response) => {
                res.write(`data: ${JSON.stringify(response)}\n\n`);
                
                // Add to chat history on final message
                if (response.type === 'final') {
                    chatHistory.push({ role: 'assistant', content: response.markdown });
                    if (chatHistory.length > 10) {
                        chatHistory = chatHistory.slice(-10);
                    }
                    res.end();
                }
            });
        } else if (['claude', 'haiku', 'sonnet'].includes(provider)) {
            const response = await claude.generateResponse(message, captions, provider);
            res.write(`data: ${JSON.stringify(response)}\n\n`);
            
            if (response.type === 'final') {
                chatHistory.push({ role: 'assistant', content: response.markdown });
                if (chatHistory.length > 10) {
                    chatHistory = chatHistory.slice(-10);
                }
            }
            res.end();
        } else if (provider === 'google') {
            const response = await google.generateResponse(message, captions);
             res.write(`data: ${JSON.stringify(response)}\n\n`);
            
            if (response.type === 'final') {
                chatHistory.push({ role: 'assistant', content: response.markdown });
                if (chatHistory.length > 10) {
                    chatHistory = chatHistory.slice(-10);
                }
            }
            res.end();
        } else {
            throw new Error('Invalid provider selected');
        }

    } catch (error) {
        console.error('Chat error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
        })}\n\n`);
        res.end();
    }
});

// Clear chat history
router.post('/clear', (req, res) => {
    chatHistory = [];
    res.json({ message: 'Chat history cleared' });
});

module.exports = router;
