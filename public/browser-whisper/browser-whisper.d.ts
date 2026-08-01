/**
 * Transcriber.ts — Public API
 *
 * Usage:
 *   const transcriber = new BrowserWhisper({ model: 'whisper-base', language: 'en' })
 *
 *   // Async-iterable style:
 *   for await (const segment of transcriber.transcribe(file)) {
 *     console.log(segment.text)
 *   }
 *
 *   // Collect everything at once:
 *   const segments = await transcriber.transcribe(file).collect()
 *
 *   // Callback style (works simultaneously with iteration):
 *   transcriber.transcribe(file, { onSegment: (s) => appendToUI(s) })
 */
import type { TranscriptSegment, TranscribeOptions, ASRModel, DownloadModelOptions } from './types.js';
/**
 * The core entry point for the browser-whisper library.
 * It manages the lifecycle of the Web Workers and exposes a simple API
 * for transcribing audio files directly in the browser via WebGPU and WebCodecs.
 */
export declare class BrowserWhisper {
    private readonly defaultOptions;
    private whisperWorker;
    /**
     * @param options Global options to apply to all transcriptions instantiated by this class.
     */
    constructor(options?: TranscribeOptions);
    /**
     * Starts transcribing a given audio or video File.
     *
     * Internally, this boots up two Web Workers:
     * 1. A Decoder Worker (using WebCodecs/MediaBunny to decode the file)
     * 2. An ASR Worker (using Transformers.js/WebGPU to run inference)
     *
     * The workers communicate with each other via a zero-copy MessageChannel,
     * entirely bypassing the main UI thread to prevent blocking.
     *
     * @param file The audio or video file to transcribe.
     * @param runtimeOptions Options that merge with and override the constructor options for this specific file.
     * @returns A TranscribeStream that implements AsyncIterable, allowing for `for await` loops.
     */
    transcribe(file: File, runtimeOptions?: TranscribeOptions): TranscribeStream;
    /**
     * Starts transcribing already-decoded mono 16-kHz PCM samples.
     * Useful with browser VAD libraries that already emit Whisper-ready audio.
     */
    transcribePCM(samples: Float32Array, runtimeOptions?: TranscribeOptions): TranscribePCMStream;
    /**
     * Explicitly downloads, stores, and verifies a model ahead of transcription.
     *
     * Model files are stored in OPFS via the worker's transformers.js custom
     * cache. Existing Cache API entries are migrated into OPFS on first access.
     */
    downloadModel(options?: ASRModel | DownloadModelOptions): Promise<void>;
    /** Deletes all browser-whisper model files from OPFS and the legacy browser cache. */
    static clearCache(): Promise<void>;
    /** Deletes cached files for one model from OPFS and the legacy browser cache. */
    static deleteModel(model: ASRModel): Promise<void>;
    /**
     * Terminates the reusable Whisper worker owned by this instance.
     * Call this when the transcriber will not be used again.
     */
    dispose(): void;
    private getWhisperWorker;
    private loadModel;
}
/**
 * A stream representing an active transcription process.
 *
 * It implements `AsyncIterable<TranscriptSegment>`, meaning you can iterate over
 * it using a `for await (const segment of stream)` loop. The loop will suspend
 * natively while waiting for the GPU to emit the next chunk of text.
 *
 * Alternatively, it accepts standard event callbacks via its constructor options.
 */
export declare class TranscribeStream implements AsyncIterable<TranscriptSegment> {
    private readonly file;
    private readonly options;
    private readonly whisperWorker;
    private readonly queue;
    private doneFlag;
    private error;
    private notify;
    private bridge;
    constructor(file: File, options?: TranscribeOptions, whisperWorker?: Worker);
    [Symbol.asyncIterator](): AsyncGenerator<TranscriptSegment>;
    /**
     * Collect all segments into an array.
     * Convenient alternative to `for await`.
     *
     * @example
     * const segments = await transcriber.transcribe(file).collect()
     */
    collect(): Promise<TranscriptSegment[]>;
    /**
     * Cancel the transcription and terminate the underlying workers.
     */
    cancel(): void;
    private startBridge;
    /** Resolve the pending Promise inside the async iterator */
    private wakeUp;
}
export declare class TranscribePCMStream implements AsyncIterable<TranscriptSegment> {
    private readonly samples;
    private readonly options;
    private readonly whisperWorker;
    private readonly queue;
    private doneFlag;
    private error;
    private notify;
    private bridge;
    constructor(samples: Float32Array, options: TranscribeOptions, whisperWorker: Worker);
    [Symbol.asyncIterator](): AsyncGenerator<TranscriptSegment>;
    collect(): Promise<TranscriptSegment[]>;
    cancel(): void;
    private startBridge;
    private wakeUp;
}
//# sourceMappingURL=browser-whisper.d.ts.map