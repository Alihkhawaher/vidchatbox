# YouTube Video Summarizer

A powerful tool that extracts and summarizes YouTube video content using captions and AI-powered analysis.

## Features

- **Multi-Language Support**
  - Supports both Arabic (RTL) and English (LTR) interfaces
  - Dynamic UI language switching
  - Automatic direction switching (RTL/LTR)

- **Multiple AI Providers**
  - Google
  - KoboldCPP
  - Claude (with multiple models)
    - Opus
    - Haiku
    - Sonnet

- **Caption Processing**
  - Extracts video captions with timestamps
  - Supports both manual and auto-generated captions
  - Preserves timestamp information for reference

- **Interactive Chat Interface**
  - Real-time streaming responses
  - Markdown support for formatted responses
  - Chat history preservation
  - Context-aware conversations about video content

- **Video Information**
  - Extracts and displays video metadata
  - Provides context for the AI analysis

- **Debug Features**
  - Toggle-able debug logging
  - Detailed error reporting
  - Request/response monitoring

## Architecture

### Backend (Node.js/Express)

- **Server Components**
  - Express server running on port 3001
  - CORS enabled for cross-origin requests
  - JSON body parser with 50MB limit
  - Static file serving
  - Request logging middleware
  - Comprehensive error handling

- **API Routes**
  - `/api/captions`: Caption extraction endpoint
  - `/api/chat`: AI interaction endpoint
  - `/api/video-info`: Video metadata endpoint

### Frontend

- **Core Components**
  - Responsive UI with CSS styling
  - Real-time language switching
  - Dynamic content rendering
  - Streaming response handling

- **User Interface Elements**
  - Language selector
  - URL input field
  - Provider selection
  - Auto-generated captions toggle
  - Chat interface
  - Debug log toggle

## Workflow

1. **Video Processing**
   - User enters YouTube URL
   - System extracts video ID
   - Fetches video information
   - Retrieves captions with timestamps

2. **AI Interaction**
   - Initial video context provided to AI
   - User can ask questions about the video
   - AI responds using video context
   - Responses stream in real-time

3. **Response Handling**
   - Markdown formatting
   - HTML sanitization
   - Timestamp preservation
   - Auto-scrolling chat interface

## Error Handling

- Input validation
- Network error handling
- API error responses
- User feedback display
- Debug logging system

## Dependencies

- `express`: Web server framework
- `cors`: Cross-origin resource sharing
- `axios`: HTTP client
- `marked`: Markdown parsing
- `youtube-captions-scraper`: Caption extraction
- `ytdl-core`: YouTube data extraction
- `dotenv`: Environment configuration

## Technical Details

- Server-sent events for streaming responses
- RTL/LTR layout support
- XSS prevention
- Markdown rendering
- Timestamp formatting
- Chat history management
- Dynamic UI updates
- Error state management

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env` file

3. Start the server:
   ```bash
   npm start
   ```

4. Access the application at `http://localhost:3001`

## Best Practices

- Input sanitization
- Error boundary implementation
- Responsive design
- Accessibility considerations
- Performance optimization
- Security measures
