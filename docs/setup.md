# YouTube Video Summarizer - Setup Guide

## Prerequisites

Before setting up the YouTube Video Summarizer, ensure you have the following installed:

1. Node.js (v12 or higher)
2. KoboldCPP or compatible AI service
3. npm (Node Package Manager)

## Installation Steps

1. Clone the repository:
```bash
git clone [repository-url]
cd youtube-summarizer
```

2. Install dependencies:
```bash
npm install
```

3. Configure KoboldCPP:
- Ensure KoboldCPP is running on port 5001
- The service should support the `/api/v1/generate` endpoint
- Configure with appropriate model settings for text summarization

## Important Note on Caption Retrieval

The application must retrieve YouTube captions on the client side (browser) to comply with YouTube's terms of service and avoid blocking. Server-side caption retrieval may result in:
- IP address blocking by YouTube
- Rate limiting issues
- Service disruptions
- Terms of service violations

This is why the caption retrieval logic is implemented in the browser using JavaScript, ensuring reliable and compliant access to video captions.

## Running the Application

1. Start KoboldCPP:
- Follow KoboldCPP's documentation to start the service
- Ensure it's running on port 5001
- Verify the API endpoint is accessible

2. Start the application server:
```bash
node server.js
```

3. Access the application:
- Open your web browser
- Navigate to `http://localhost:3000`

## Environment Configuration

The application uses the following default configurations:
- Server Port: 3000
- AI Service URL: http://localhost:5001
- AI Service Endpoint: /api/v1/generate

## Troubleshooting

1. If the server fails to start:
- Check if port 3000 is already in use
- Verify Node.js installation
- Check for any error messages in the console

2. If captions fail to load:
- Verify the YouTube URL is valid
- Check if the video has available captions
- Verify selected language availability

3. If summarization fails:
- Check if KoboldCPP is running
- Verify the AI service endpoint is accessible
- Check the AI service logs for errors

## System Requirements

- Operating System: Windows/Linux/MacOS
- Memory: 4GB RAM minimum
- Storage: 1GB free space
- Internet connection for YouTube access
