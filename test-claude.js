require('dotenv').config();
const { generateResponse } = require('./providers/claude.js');

async function test() {
    try {
        console.log('Testing Claude API...');
        console.log('API Key:', process.env.CLAUDE_API_KEY ? 'Found' : 'Not found');
        const response = await generateResponse('Hello', 'This is a test caption.', 'claude');
        console.log('Response:', response);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
