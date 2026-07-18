# VidChatBox — Comprehensive Test Results

**Date:** July 16-17, 2026
**Test Video:** https://www.youtube.com/watch?v=O80bwMLK5jM (4-min Arabic Quranic lecture)
**Test Audio:** audio_16k_mono.wav (7.3MB, 239s, 16kHz mono)

---

## 1. Browser-Side Whisper Models (Transformers.js, CPU WASM, 8 threads)

| Model | Key Words | Chars | Load | Transcribe | Quality |
|-------|-----------|-------|------|-----------|---------|
| whisper-small (q4) | 0/7 | ~360 | 6.7s | 25s | Gibberish (الكافب، الفاصق، الصيوات) |
| whisper-medium (q8) | 6/7 | ~2800 | 7.1s | 526s | Coherent, most words correct |
| **whisper-medium (q4)** | **7/7** | ~2700 | 6.7s | 366s | **Best — all key words correct** |

**Key words tested:** الكافر، الفاسق، الصراط، طريق، يدبر، الضالين، النصارة

**Conclusion:** whisper-medium q4 is the right default for Arabic. whisper-small produces gibberish.

---

## 2. OpenRouter STT Models (4-min Arabic, WAV upload)

| Model | Provider | Chars | Time | Cost | Full Transcript? |
|-------|----------|-------|------|------|------------------|
| **Microsoft MAI-Transcribe 1.5** | Microsoft | 2690 | 3.6s | $0.024 | ✅ Full, proper punctuation |
| Mistral Voxtral Mini | Mistral | 2562 | 4.7s | $0.012 | ✅ Full, no punctuation |
| OpenAI GPT-4o Transcribe | OpenAI | 2636 | 11.5s | $0.014 | ✅ Full, some punctuation |
| OpenAI GPT-4o Mini | OpenAI | 2589 | 10.7s | $0.007 | ✅ Full, cheapest |
| OpenAI Whisper 1 | OpenAI | 2529 | 33.3s | $0.024 | ✅ Full, slow |
| **OpenAI Whisper Large V3** | OpenAI | 1154 | 3.3s | $0.006 | ❌ **TRUNCATED** — starts mid-sentence |
| OpenAI Whisper Large V3 Turbo | OpenAI | — | — | — | ❌ 429 rate limit |
| Google Chirp 3 | Google | — | — | — | ❌ 400 error (not available) |
| NVIDIA Parakeet TDT | NVIDIA | 2363 | 2.6s | $0.006 | ❌ Outputs English transliteration |
| Groq Whisper Large V3 | Groq | — | — | — | ❌ Model doesn't exist |

**Conclusion:** Microsoft MAI-Transcribe 1.5 is best — fastest, full transcript, proper Arabic punctuation.

---

## 3. Audio Speed-Up Test (MAI-Transcribe, 4-min Arabic)

| Speed | File Size | Duration | Chars | Time | Quality | Loss |
|-------|-----------|----------|-------|------|---------|------|
| **1.0x** | **7.3MB** | **239s** | **2691** | **2.7s** | **Baseline** | **0 chars** |
| 1.3x | 5.6MB | 184s | 2675 | 5.0s | 99.4% | 16 chars |
| 1.4x | 5.2MB | 171s | 2684 | 2.7s | 99.7% | 7 chars |
| 1.5x | 4.9MB | 159s | 2683 | 2.9s | 99.8% | 8 chars |
| 1.6x | 4.6MB | 149s | 2680 | 2.4s | 99.6% | 11 chars |
| 1.7x | 4.3MB | 141s | 2680 | 2.5s | 99.6% | 11 chars |
| 2.0x | 3.6MB | 120s | 2664 | 2.4s | 99.1% | 27 chars |

**Method:** Drop samples with linear interpolation, keep sample rate at 16kHz (standard WAV format).

**Conclusion:** 1.0x default (full quality). Users can choose 1.4x-1.6x for smaller uploads with minimal quality loss.

---

## 4. Memory Usage (whisper-medium q4, Node.js)

| Stage | RSS Memory |
|-------|------------|
| Baseline | 52 MB |
| Model weights loaded | 1,437 MB |
| After 5s transcription | 5,743 MB |
| Full 239s transcription | 9,400 MB |

**Conclusion:** Model weights are 1.44GB (fits browser). The 9.4GB peak is WASM fp32 activation arena + KV-cache. On WebGPU, activations live in GPU memory, keeping browser-tab memory near 1.4GB.

---

## 5. Local Whisper-medium q4 Model Files

| File | Size |
|------|------|
| encoder_model_q4.onnx | 210 MB |
| decoder_model_merged_q4.onnx | 470 MB |
| config.json + tokenizer + misc | ~1 MB |
| **Total** | **~681 MB** |

Downloaded once from HuggingFace (`Xenova/whisper-medium`), cached in browser Cache API.

---

## 6. Bonsai LLM Models (1-bit quantized)

| Model | Size | Status | Notes |
|-------|------|--------|-------|
| Bonsai-1.7B | ~200MB | ✅ Works | 1-bit, fastest, default |
| Ternary-Bonsai-1.7B | ~300MB | ✅ Works | 2-bit, slightly better |
| Bonsai-4B | ~400-600MB | ❌ OOM | `std::bad_alloc` in browser WebGPU |
| Bonsai-8B | ~800MB-1GB | ❌ OOM | Same issue |

**Conclusion:** Only Bonsai 1.7B works in browser. 4B/8B exceed browser memory limits.

---

## 7. Cloud STT: verbose_json Support

| Model | verbose_json support | Timestamps available? |
|-------|---------------------|----------------------|
| Microsoft MAI-Transcribe | ❌ | No |
| Mistral Voxtral Mini | ❌ | No |
| OpenAI GPT-4o Transcribe | ✅ | Yes |
| OpenAI Whisper 1 | ✅ | Yes |

**Conclusion:** Timestamps only available with OpenAI models. Non-OpenAI models use `json` format (text only).

---

## 8. Chunk Size Test (4-min audio)

| Chunk Size | Chunks | Result |
|------------|--------|--------|
| 5 minutes | 1 | 2691 chars, 3.3s |
| 10 minutes | 1 | 2691 chars, 2.9s |

For 4-min audio, both are single chunk. Chunking only matters for audio >5 minutes.

---

## Files Modified

| File | Changes |
|------|---------|
| `public/transcriber.js` | Complete rewrite: Transformers.js + whisper-medium q4, OpenRouter STT with speed-up + chunking, WhisperTextStreamer progress |
| `public/chat-llm.js` | Added Bonsai 1.7B via Transformers.js, dual-engine (Bonsai + WebLLM), unified streaming |
| `public/index.html` | Tabbed settings modal (Local/Cloud/Advanced), AI mode selector, all model selects, audio speed selector |
| `public/main.js` | Model-aware caching, auto cloud STT, transcription progress with live text, fixed defaults |
| `public/libs/transformers/` | ONNX Runtime WASM module for fallback |
| `README.md` | Complete rewrite with new architecture |
| `docs/usage.md` | Complete rewrite with new features |
| `docs/test-results.md` | This file |