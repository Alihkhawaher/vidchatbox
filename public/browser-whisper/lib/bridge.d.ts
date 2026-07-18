/**
 * bridge.ts
 *
 * Orchestrates the Decoder and Whisper workers via:
 *  - A MessageChannel for direct worker-to-worker PCMChunk flow
 *  - Routing messages from the Whisper worker back to the caller via callbacks
 *
 * ── Bundler compatibility ─────────────────────────────────────────────────────
 * Workers use `?worker&inline` so Vite bundles each into a self-contained blob
 * URL at build time. The published dist/index.js contains plain
 * `URL.createObjectURL(new Blob([...]))` calls, so it works in any JS runtime.
 *
 * All dependencies (@huggingface/transformers, mediabunny, onnxruntime-web)
 * are bundled into the blobs — bare specifiers cannot be resolved from a
 * blob: URL at runtime. WASM binaries are excluded via the .wasm alias and
 * loaded from CDN at runtime via env.backends.onnx.wasm.wasmPaths instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { TranscriptSegment, TranscribeProgress, ASRModel, QuantizationType } from '../types.js';
export interface BridgeCallbacks {
    onSegment: (segment: TranscriptSegment) => void;
    onProgress: (event: TranscribeProgress) => void;
    onDone: () => void;
    onError: (message: string) => void;
}
export interface BridgeOptions {
    whisperWorker?: Worker;
}
export declare class Bridge {
    private readonly decoderWorker;
    private readonly whisperWorker;
    private readonly callbacks;
    private readonly ownsWhisperWorker;
    private terminated;
    constructor(callbacks: BridgeCallbacks, options?: BridgeOptions);
    /**
     * Start transcription.
     *
     * Model loading and decoding run concurrently — the Whisper worker starts
     * loading the model at the same time MediaBunny begins demuxing/decoding.
     * Chunks queued before the model is ready are processed in order once ready.
     */
    start(file: File, model?: ASRModel, language?: string, quantization?: QuantizationType): Promise<void>;
    /**
     * Start transcription from already-decoded mono 16-kHz PCM.
     * This bypasses media decoding and avoids padding short utterances to 30s.
     */
    startPCM(samples: Float32Array, model?: ASRModel, language?: string, quantization?: QuantizationType): Promise<void>;
    /** Terminate both workers and clean up resources */
    terminate(): void;
    /** Fallback for older browsers (e.g. Safari < 16.4) that lack WebCodecs AudioDecoder */
    private decodeWithAudioContext;
    private handleWhisperMessage;
    private handleDecoderMessage;
    /**
     * Returns a Promise that resolves when the Whisper worker posts 'ready',
     * or rejects if it posts 'error' first.
     */
    private waitForReady;
}
//# sourceMappingURL=bridge.d.ts.map