# API Documentation

## Endpoints

### Video Information

```
GET /api/video-info/:videoId
```

Retrieves metadata and information about a YouTube video.

**Parameters:**
- `videoId`: The YouTube video ID

**Response:**
```json
{
  "formattedMessage": "string",
  "title": "string",
  "description": "string",
  "duration": "string"
}
```

### Captions

```
GET /api/captions/:videoId
```

Retrieves captions for a YouTube video.

**Parameters:**
- `videoId`: The YouTube video ID
- `lang`: Language code (e.g., 'en', 'ar')
- `auto`: Boolean to allow auto-generated captions
- `timestamps`: Boolean to include timestamps
- `provider`: AI provider to use for processing

**Response:**
- Text content with formatted captions including timestamps

### Chat

```
POST /api/chat
```

Sends a message to the AI for processing video context.

**Request Body:**
```json
{
  "message": "string",
  "captions": "string",
  "provider": "string"
}
```

**Response:**
Server-sent events stream with the following formats:

```json
{
  "type": "chunk",
  "html": "string"
}
```

```json
{
  "type": "final",
  "html": "string"
}
```

```json
{
  "type": "error",
  "error": "string"
}
```

```
POST /api/chat/clear
```

Clears the current chat history.

**Response:**
- 200 OK on success

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request details",
  "details": "Error description"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "Error description",
  "timestamp": "ISO timestamp"
}
```

## Rate Limiting

- Default rate limit: 100 requests per minute per IP
- Streaming endpoints may have different limits

## Authentication

Currently, the API is open and does not require authentication. However, rate limiting is applied to prevent abuse.

## Response Headers

Common response headers:
```
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST
Access-Control-Allow-Headers: Content-Type
```

For streaming responses:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
