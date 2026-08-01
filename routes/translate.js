const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * POST /api/translate
 * Lightweight translation endpoint using OpenRouter chat completions.
 * Unlike /api/chat, this has no system prompt about video captions —
 * it sends a clean translation request.
 */
router.post('/', async (req, res) => {
    const { text, targetLanguage, model, context } = req.body;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ error: 'OpenRouter API key is required for translation.' });
    }
    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'text and targetLanguage are required.' });
    }

    const translationModel = model || 'deepseek/deepseek-v4-pro';

    // Validate context is a string (full SRT for story understanding)
    let validContext = null;
    if (context && typeof context === 'string' && context.length > 0) {
        validContext = context;
    }

    const systemPrompt = `You are a professional subtitle translator. Translate subtitles to ${targetLanguage}. Rules:\n` +
        `- Keep the EXACT same SRT format (number, timestamp, text, blank line)\n` +
        `- Do NOT modify timestamps or sequence numbers\n` +
        `- Translate only the text lines\n` +
        `- Preserve line breaks and formatting\n` +
        `- Output ONLY the translated SRT — no explanations, no markdown fences`;

    const messages = [
        {
            role: 'system',
            content: validContext
                ? `${systemPrompt}\n\nThe FULL SUBTITLE FILE below is provided as context for story understanding and consistency. Only translate the text in the <text_to_translate> section — do NOT repeat or re-translate the context.\n\n<context>\n${validContext}\n</context>`
                : systemPrompt
        },
        {
            role: 'user',
            content: validContext
                ? `<text_to_translate>\n${text}\n</text_to_translate>`
                : text
        }
    ];

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: translationModel,
                messages,
                max_tokens: 16384,
                temperature: 0.3,
                stream: false,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': process.env.APP_URL,
                    'X-Title': 'VidChatBox Subtitle Translation'
                },
                timeout: 300000,
            }
        );

        const translated = response.data?.choices?.[0]?.message?.content;
        if (!translated) {
            return res.status(502).json({ error: 'Translation model returned empty response.' });
        }

        res.json({
            translated: translated.trim(),
            model: translationModel,
            targetLanguage,
        });

    } catch (error) {
        console.error('Translation error:', error.message);
        const status = error.response?.status || 500;
        const detail = error.response?.data?.error?.message || error.message;
        res.status(status).json({ error: `Translation failed: ${detail}` });
    }
});

module.exports = router;