/**
 * whisper-worker.ts
 *
 * Runs in a Web Worker. Responsible for:
 *  1. Loading the ASR pipeline from transformers.js
 *  2. Receiving mono 16-kHz PCMChunks from the decoder worker via MessagePort
 *  3. Running inference on each chunk
 *  4. Adjusting timestamps to be file-relative (adding chunk.timestamp)
 *  5. Posting TranscriptSegments back to the main thread
 */
export {};
//# sourceMappingURL=whisper-worker.d.ts.map