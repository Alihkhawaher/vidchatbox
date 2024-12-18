# YouTube Video Summarizer - Usage Guide

## Getting Started

The YouTube Video Summarizer allows you to extract and summarize captions from YouTube videos in multiple languages. This guide will walk you through all the features and how to use them effectively.

## Basic Usage

1. **Enter YouTube URL**
   - Paste any YouTube video URL in the input field
   - Supported formats:
     - `https://www.youtube.com/watch?v=VIDEO_ID`
     - `https://youtu.be/VIDEO_ID`

2. **Select Language**
   - Choose from available languages in the dropdown menu
   - Default is English
   - Available languages:
     - English
     - Spanish
     - French
     - German
     - Italian
     - Portuguese
     - Russian
     - Japanese
     - Korean
     - Chinese

3. **Caption Options**
   - Check "Allow auto-generated captions" to include auto-generated captions
   - Uncheck to use only manual captions
   - Auto-generated captions are used as fallback when manual captions aren't available

4. **Get Summary**
   - Click "Get Summary" button
   - The application will:
     1. Extract video captions
     2. Generate a summary using AI
     3. Display both original captions and summary

## Viewing Results

The results are displayed in two tabs:

1. **Original Captions**
   - Shows the complete transcript of the video
   - Preserves original formatting
   - Useful for context and verification

2. **Summary**
   - Shows the AI-generated summary
   - Concise overview of the video content
   - Generated using KoboldCPP

## Features

### Language Selection
- Choose from multiple languages
- System attempts to find captions in selected language
- Falls back to auto-generated if enabled

### Auto-Generated Captions
- Toggle auto-generated captions
- Useful when manual captions aren't available
- May be less accurate than manual captions

### Debug Panel
- Shows detailed logs of the process
- Useful for troubleshooting
- Displays timestamps for each operation

## Best Practices

1. **Video Selection**
   - Choose videos with clear audio
   - Verify captions are available
   - Consider video length (longer videos may take more time)

2. **Language Selection**
   - Select primary language of the video
   - Enable auto-generated captions for better coverage
   - Check available languages before processing

3. **Summary Review**
   - Compare summary with original captions
   - Use summary as overview, not complete replacement
   - Consider context when interpreting summary

## Error Messages

Common error messages and solutions:

1. **"Invalid YouTube URL"**
   - Check URL format
   - Ensure video exists
   - Try copying URL directly from YouTube

2. **"No captions found"**
   - Video might not have captions
   - Try enabling auto-generated captions
   - Check different language options

3. **"AI service not available"**
   - Verify KoboldCPP is running
   - Check port 5001 is accessible
   - Restart AI service if needed

## Tips and Tricks

1. **For Better Summaries**
   - Use videos with clear speech
   - Choose appropriate language settings
   - Verify caption quality before summarizing

2. **Performance Optimization**
   - Close unused browser tabs
   - Wait for each operation to complete
   - Don't submit multiple requests simultaneously

3. **Troubleshooting**
   - Check debug panel for detailed logs
   - Verify all services are running
   - Clear browser cache if issues persist

## Limitations

- Requires internet connection
- Depends on YouTube caption availability
- Summary quality depends on caption quality
- Processing time varies with video length
- AI service must be running locally

## Support

If you encounter issues:
1. Check the documentation
2. Review error messages
3. Check service status
4. Verify prerequisites
5. Review debug logs
