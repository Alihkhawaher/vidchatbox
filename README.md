# VidChatBox

A standalone PWA that fetches YouTube video captions, transcribes audio in-browser using Whisper AI, and chats about video content using Bonsai LLM — all running locally in the browser via WebGPU with no API keys required.

## Features

### Caption Processing
- Extract both manual and auto-generated YouTube captions
- Support for 17+ languages including Arabic, English, Spanish, French, and more
- Intelligent fallback to auto-generated captions
- **Browser-side Whisper transcription** when no captions exist
- **Progress indication** during caption fetching with progress bars
- **Retry mechanism** with actionable error messages
- **Chat persistence** — chat history saved per video in localStorage

### Browser-Side Transcription (whisper-medium via WebGPU)
When YouTube provides no captions, the app transcribes audio directly in the browser:
1. Audio fetched from server via **yt-dlp + ffmpeg** pipeline (outputs 16kHz WAV)
2. **Transformers.js v4.2.0** loads whisper-medium (q4 quantized, ~680MB) via WebGPU
3. **WhisperTextStreamer** provides live progress — chunk count + decoded text preview
4. **Proper chunking** (`chunk_length_s: 30, stride_length_s: 5`) for long audio
5. Falls back to whisper-small (q8) on WASM if WebGPU unavailable
6. Model cached in browser Cache API after first download (offline after)
7. **Arabic-first**: whisper-medium fixes ALL critical Arabic errors that whisper-small gets wrong (الكافر، الفاسق، الصراط، طريق، يدبر، الضالين)
8. **90-second timeout** per cloud transcription chunk
9. **Configurable chunk duration** for long audio splitting

### Smart Subtitles (One-Click Workflow)
- **Smart Subtitle Modal** — unified view of YouTube tracks, cached subtitles, and transcription
- **Searchable target language** — 90+ languages with filterable dropdown + native names
- **Unified source list** — YouTube official, YouTube auto, cached subtitles (with origin tags), transcription
- **Auto-translate** — if source ≠ target language, subtitles are automatically translated via OpenRouter
- **Cached subtitle detection** — previously translated subs shown with ✓ cached tag
- **Recent languages** — last 5 target languages pinned as one-tap chips (saved in settings)
- **Transcription as last resort** — explicit opt-in only, with cost indication
- **Transcribe → translate** — transcribed audio auto-translates to target language

### P2P Subtitle Sharing
- **Peer-to-peer** — subtitles shared directly between browsers via WebRTC (no server involved)
- **Trystero + Nostr** — decentralized signaling via Nostr relays; actual data flows via encrypted WebRTC
- **Single public room** — all users in one room discover each other's subtitle caches
- **Custom rooms** — 6-char room ID + QR code for private sharing
- **"Shared by peers" source** — peers with subtitles for your video appear in the Smart Subtitle Modal
- **Auto-cache** — subtitles received from peers are cached locally for instant future use
- **Security pipeline** — all peer data sanitized (HTML stripped, types validated, size limits enforced)
- **Fully opt-in** — toggle in Settings → Peer-to-Peer
- **No external dependencies** — Trystero and QR code libraries bundled locally

### Browser-Side LLM Chat (Bonsai via WebGPU)
- **Bonsai 1.7B** (1-bit quantized, ~200MB) — default, tiny download via Transformers.js
- **Ternary Bonsai 1.7B** (2-bit, ~300MB) — better quality alternative
- **Qwen3 4B** (via WebLLM, ~2.6GB) — larger, higher quality option
- All run entirely in-browser via WebGPU — no API keys, fully private
- Models cached after first download
- **Event-driven streaming** (no busy-wait polling)

### AI-Powered Chat (Server-side)
- Multiple providers: Google, Claude (Sonnet 4/Haiku), OpenRouter
- **Conversation history** sent to AI for multi-turn context
- **Model validation** — server rejects unknown model IDs
- Streaming responses via Server-Sent Events

### Video Metadata Header
- Displays video **title**, **author**, **description**, **thumbnail**, and **link** in chat header
- Uses **yt-dlp** server-side for full metadata including description
- Falls back to **oEmbed API** (client-side) if server unavailable

### Settings & Configuration
- **Unified settings system** — single `vidchatbox_settings` localStorage key
- **AI Mode selector** (Local/Cloud/Auto) — controls both transcription and chat
- Settings sections **show/hide based on AI mode**
- **Settings validation** on save (API key format checking)
- **Reset to defaults** button
- **Settings button** visible on homepage (mobile-friendly)

### History Management
- **History panel** — view all saved transcripts and chat history
- **Load saved transcripts** — click to restore any previous transcript
- **Delete individual entries** or **delete all** with confirmation
- **Clear Chat** button to reset current session

### User Interface
- Responsive Bulma CSS design with RTL support
- Arabic/English language switching
- **Distinct chat message colors** — user (blue), AI (gray), system (yellow border)
- Debug panel for troubleshooting
- Copy buttons on all messages
- **Friendly error messages** with actionable suggestions

## Architecture

### Frontend (Browser)
- Vanilla JavaScript (no bundler, no build step)
- Bulma CSS framework (local)
- **`@huggingface/transformers@4.2.0`** — loaded from CDN (jsDelivr), cached by browser
  - whisper-medium (q4) for transcription with WebGPU
  - Bonsai 1.7B (q1) for LLM chat with WebGPU
- **`browser-whisper`** — bundled locally as fallback engine
- **Event delegation** for dynamically loaded page elements

### Backend (Node.js/Express)
- `/api/captions/:videoId` — YouTube caption scraping (youtube-captions-scraper)
- `/api/captions/video-meta/:videoId` — Video metadata via yt-dlp
- `/api/captions/available/:videoId` — List available subtitle tracks + detected spoken language
- `/api/audio/:videoId` — YouTube audio proxy via yt-dlp (spawn, not exec)
- `/api/translate` — Subtitle translation proxy (OpenRouter)
- `/api/chat` — AI chat with conversation history and model validation
- **Restricted CORS** in production (configurable via CORS_ORIGIN env var)
- **Rate limiting** on API routes
- **Security headers** (COOP/COEP for SharedArrayBuffer)

### File Structure
```
.env.example              # Environment variable template
.gitignore                # Git ignore rules
package.json              # Node.js dependencies
run.cmd                   # Windows quick-start script
server.js                 # Express server entry point
public/
├── libs/
│   ├── css/              # Bulma CSS, Font Awesome (local)
│   ├── webfonts/         # Font files (local)
│   ├── transformers/     # ONNX Runtime WASM module (local)
│   ├── ffmpeg/           # FFmpeg.wasm (local)
│   ├── trystero/         # Trystero Nostr/WebRTC bundle (137KB)
│   └── qrcode/           # QR code generation bundle (48.5KB)
├── browser-whisper/      # BrowserWhisper bundled library
├── web-llm/              # WebLLM bundled library
├── js/router.js          # Client-side router
├── p2p.js                # P2P subtitle sharing module (Trystero WebRTC)
├── settings.js           # Unified settings module
├── transcriber.js        # Whisper transcription (Transformers.js + whisper-medium q4)
├── chat-llm.js           # Bonsai LLM + WebLLM chat (dual engine)
├── chat-ui.js            # Chat UI rendering
├── main.js               # Core application logic, chat persistence, event delegation
├── events.js             # Provider status handlers
├── translations.js       # i18n strings (EN/AR)
├── utils.js              # Utility functions (single source of truth)
├── styles.css            # Custom styles
├── index.html            # Main HTML shell
├── menu.html             # Navigation menu
├── youtube-proxy-sw.js   # Service worker for YouTube proxy
└── pages/                # Router pages (home, diag, install-android, api-instructions)
scripts/
├── trystero-entry.js     # Trystero entry point for esbuild bundle
└── qr-entry.js           # QR code entry point for esbuild bundle
routes/
├── audio.js              # Audio proxy (yt-dlp + ffmpeg via spawn)
├── captions.js           # Caption API + video metadata (yt-dlp)
├── chat.js               # Chat API with history and model validation
└── translate.js          # Subtitle translation proxy (OpenRouter)
providers/
├── claude.js             # Claude AI provider (Sonnet 4, Haiku 3.5)
├── google.js             # Google AI provider (Gemini)
├── openrouter.js         # OpenRouter provider
└── koboldcpp.js          # KoboldCPP provider
utils/
├── api-utils.js          # Shared API error handling
└── provider-utils.js     # Base provider class and utilities
```

## Model Defaults

| Task | Model | Size | Engine | Fallback |
|------|-------|------|--------|----------|
| Transcription | whisper-medium (q4) | ~680MB | Transformers.js + WebGPU | whisper-small (q8) WASM |
| LLM Chat | Bonsai 1.7B (q1) | ~200MB | Transformers.js + WebGPU | Qwen3 4B via WebLLM |
| Cloud Chat | Claude Sonnet 4 | - | OpenRouter API | GPT-4o, Qwen3.7 |
| Cloud STT | MAI-Transcribe 1.5 | - | OpenRouter API | Voxtral Mini |

## Requirements

### Server
- Node.js 20+
- **yt-dlp** installed and in PATH
- **ffmpeg** installed and in PATH

### Browser
- Chrome/Edge 113+ (WebGPU required for whisper-medium and Bonsai)
- WebGPU detection: app automatically falls back to WASM/whisper-small if unavailable
- First use requires internet for model download; cached offline after

## Quick Start & Deployment

```bash
npm install
node server.js
```

- Default port: 3005 (configurable via `PORT` env variable)
- Access at `http://localhost:3005`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3005) |
| `NODE_ENV` | Environment (production/development) |
| `CLAUDE_API_KEY` | Claude API key (server fallback) |
| `GOOGLE_API_KEY` | Google API key (server fallback) |
| `OPENROUTER_API_KEY` | OpenRouter API key (server fallback) |
| `APP_URL` | Application URL used for OpenRouter HTTP-Referer header (required) |
| `CORS_ORIGIN` | Comma-separated allowed origins for production |

## Pending Tasks

- [ ] Make KoboldCPP base URL (`http://localhost:5001`) configurable via settings page instead of hardcoded in `providers/koboldcpp.js`

## Offline / PWA

The app works offline after first use:
1. Transformers.js library (~432KB) loads from CDN, cached by browser
2. whisper-medium q4 model (~680MB) downloads once, cached in Cache API
3. Bonsai 1.7B q1 model (~200MB) downloads once, cached in Cache API
4. All CSS/JS/fonts bundled locally in `public/libs/`
5. No external CDN dependencies at runtime (models cached from HuggingFace)