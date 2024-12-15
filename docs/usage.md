# Usage Guide

## Getting Started

1. Open the application in your web browser at `http://localhost:3001`
2. Select your preferred language (Arabic/English)
3. Choose an AI provider from the dropdown menu

## Basic Usage

### Analyzing a Video

1. Copy a YouTube video URL
2. Paste it into the URL input field
3. Choose whether to allow auto-generated captions
4. Click "Get Captions"
5. Wait for the video information and captions to load

### Interacting with AI

1. Once captions are loaded, use the chat interface
2. Type your question about the video
3. Press Enter or click the send button
4. Watch as the AI streams its response
5. Continue the conversation as needed

## Features

### Language Settings

- Toggle between Arabic and English
- UI automatically adjusts for RTL/LTR
- All messages and errors update to selected language

### AI Providers

**Google**
- Fast responses
- Good for general summaries
- Best for factual analysis

**Claude**
- Three models available:
  - Opus: Most capable, slower
  - Haiku: Fast, concise
  - Sonnet: Balanced option

**KoboldCPP**
- Self-hosted option
- Customizable responses
- Local processing

### Caption Options

- Manual captions: More accurate
- Auto-generated: Available when manual unavailable
- Timestamp preservation
- Multiple language support

### Chat Interface

- Real-time streaming
- Markdown formatting
- Code block support
- Auto-scrolling
- History preservation

### Debug Features

1. Click "Toggle Debug Log"
2. View request/response details
3. Monitor API calls
4. Track errors

## Best Practices

### Video Selection

- Choose videos with clear audio
- Prefer videos with manual captions
- Verify video is not private/restricted

### Asking Questions

- Be specific in your queries
- Reference video timestamps when relevant
- Ask one question at a time
- Build on previous responses

### Performance Tips

- Clear chat history for new videos
- Use appropriate AI model for task
- Monitor response times
- Check debug log for issues

## Advanced Features

### Timestamp Navigation

- Click timestamps to reference specific parts
- Use timestamps in questions
- Include time context in responses

### Provider Selection

Choose based on needs:
- Speed: Haiku/Google
- Accuracy: Opus/Sonnet
- Cost: KoboldCPP

### Error Recovery

- Check debug log
- Verify API status
- Retry with different provider
- Clear chat and restart

## Limitations

- Video length restrictions
- API rate limits
- Provider-specific constraints
- Language support varies

## Tips & Tricks

1. Use clear, concise questions
2. Reference specific video sections
3. Build context progressively
4. Monitor debug log for insights
5. Switch providers for different tasks
