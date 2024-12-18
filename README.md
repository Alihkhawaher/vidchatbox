# YouTube Video Summarizer

A powerful web application that leverages AI to transform YouTube video content into concise, readable summaries. Using KoboldCPP's advanced language models, it processes video captions in multiple languages to generate intelligent summaries while preserving key information.

## Features

### Caption Processing
- Extract both manual and auto-generated YouTube captions
- Support for 10+ languages including English, Spanish, French, and more
- Intelligent fallback to auto-generated captions when manual ones aren't available
- Real-time caption extraction with progress tracking

### AI-Powered Summarization
- Advanced text summarization using KoboldCPP's language models
- Configurable summarization parameters (length, style, focus)
- Context-aware processing that maintains video's key points
- Real-time streaming of summary generation

### User Interface
- Modern, responsive design supporting all devices
- Real-time progress indicators and status updates
- Split-view display of original captions and summary
- Advanced debug panel for troubleshooting

### System Integration
- RESTful API for service integration
- Comprehensive error handling and recovery
- Health monitoring and status reporting
- Extensible architecture for additional AI services

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Configure and start KoboldCPP:
```bash
# Start KoboldCPP with appropriate model
koboldcpp --model [your-model.gguf] --port 5001
```

3. Launch the application:
```bash
node server.js
```

4. Access the interface at http://localhost:3000

## System Requirements

### Minimum Requirements
- CPU: 4+ cores
- RAM: 8GB minimum (16GB recommended)
- Storage: 2GB free space
- Node.js v14 or higher
- Modern web browser with ES6 support

### Recommended Setup
- CPU: 8+ cores
- RAM: 16GB or more
- SSD Storage: 5GB+ free space
- High-speed internet connection
- GPU: NVIDIA with 6GB+ VRAM (for optimal AI performance)

## Documentation

Comprehensive documentation available in the `docs` folder:

- [Setup Guide](docs/setup.md)
  - Installation instructions
  - Configuration options
  - Environment setup
  - Deployment guides

- [API Documentation](docs/api.md)
  - RESTful endpoints
  - Request/response formats
  - Error handling
  - Integration examples

- [Usage Guide](docs/usage.md)
  - Feature walkthrough
  - Best practices
  - Troubleshooting
  - Advanced usage

## Architecture

### Frontend Layer
- Modern JavaScript with ES6+ features
- Real-time updates using Server-Sent Events
- Responsive design with mobile support
- Comprehensive error handling and user feedback

### Backend Server
- Node.js/Express architecture
- RESTful API design
- Streaming response support
- Robust error handling and logging
- Service health monitoring
- Rate limiting and request validation

### AI Integration
- KoboldCPP integration for text processing
- Configurable model parameters
- Streaming response processing
- Error recovery and fallback options

## Error Handling

### Comprehensive error handling for:
- Network connectivity issues
- Invalid video URLs or IDs
- Missing or unavailable captions
- Language support problems
- AI service disruptions
- Rate limiting and quota issues

### Error Recovery
- Automatic retry mechanisms
- Graceful degradation
- Clear user feedback
- Detailed error logging
- Recovery suggestions

## Performance Optimization

### Caption Processing
- Efficient caption extraction
- Caching of frequently accessed content
- Parallel processing where applicable
- Memory usage optimization

### AI Processing
- Streaming response handling
- Configurable processing parameters
- Resource usage monitoring
- Performance metrics tracking

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Commit changes (`git commit -am 'Add new feature'`)
4. Push to branch (`git push origin feature/improvement`)
5. Create Pull Request

### Development Guidelines
- Follow ESLint configuration
- Add tests for new features
- Update documentation
- Follow semantic versioning

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

### Troubleshooting Steps
1. Check the application logs
2. Verify service health status
3. Review system requirements
4. Check network connectivity
5. Validate configuration settings

### Getting Help
- Review documentation
- Check debug panel
- Verify service status
- Review system logs
- Check GitHub issues

## Future Roadmap

### Planned Features
- Multi-language translation support
- Batch video processing
- Advanced summarization options
- Additional AI service integrations
- Enhanced error reporting
- Performance optimizations
- API rate limiting
- User authentication
- Result persistence
- Analytics dashboard
