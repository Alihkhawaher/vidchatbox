# Setup Guide

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- A modern web browser
- Internet connection

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd youtube-summarizer
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
# AI Provider API Keys
GOOGLE_API_KEY=your_google_api_key
CLAUDE_API_KEY=your_claude_api_key
KOBOLDCPP_API_URL=your_koboldcpp_endpoint

# Server Configuration
PORT=3001
NODE_ENV=development
```

4. Configure AI Providers:

### Google AI
- Visit Google Cloud Console
- Create a new project
- Enable the required APIs
- Create API credentials
- Add the API key to `.env`

### Claude
- Visit Anthropic's website
- Sign up for API access
- Generate an API key
- Add the API key to `.env`

### KoboldCPP
- Set up a KoboldCPP instance
- Configure the endpoint
- Add the endpoint URL to `.env`

## Running the Application

### Development Mode
```bash
npm start
```

### Production Mode
```bash
NODE_ENV=production npm start
```

## Troubleshooting

### Common Issues

1. Port already in use:
   - Change the port in `.env`
   - Kill the process using the port
   - Restart the application

2. API Key errors:
   - Verify API keys in `.env`
   - Check API key permissions
   - Ensure proper formatting

3. Network errors:
   - Check internet connection
   - Verify firewall settings
   - Check proxy configuration

### Debug Mode

Enable debug mode in the UI to see detailed logs:
1. Click "Toggle Debug Log"
2. Check browser console for additional information
3. Review server logs in terminal

## System Requirements

- Minimum 2GB RAM
- 1GB free disk space
- Modern CPU (2 cores recommended)
- Stable internet connection

## Security Considerations

- Keep API keys secure
- Don't commit `.env` file
- Use HTTPS in production
- Implement rate limiting
- Monitor API usage
