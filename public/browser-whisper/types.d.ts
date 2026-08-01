export type ASRModel = 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'whisper-tiny_timestamped' | 'whisper-base_timestamped' | 'whisper-small_timestamped' | 'whisper-large-v3-turbo' | 'whisper-large-v3-turbo_timestamped' | 'whisper-large-v3' | 'lite-whisper-large-v3-turbo-fast' | 'lite-whisper-large-v3-turbo' | 'lite-whisper-large-v3-turbo-acc' | 'moonshine-tiny' | 'moonshine-base' | 'distil-whisper-small';
export interface ModelConfig {
    /** Hugging Face Hub model ID */
    hfId: string;
    /** dtype passed to transformers.js when quantization is 'hybrid' */
    hybridDtype: Record<string, string> | string;
    /** Whether the model supports return_timestamps / chunk_length_s / stride_length_s */
    supportsTimestamps: boolean;
    /** Whether the model supports `return_timestamps: 'word'` (DTW word alignment) */
    supportsWordTimestamps: boolean;
    /** Whether the model supports the language parameter */
    supportsLanguage: boolean;
}
export declare const MODELS: Record<ASRModel, ModelConfig>;
/**
 * @deprecated Renamed to {@link ASRModel} to reflect support for non-Whisper models (Moonshine, Distil-Whisper).
 * `WhisperModel` will be removed in a future major version. Update your imports:
 * ```ts
 * // before
 * import type { WhisperModel } from 'browser-whisper';
 * // after
 * import type { ASRModel } from 'browser-whisper';
 * ```
 */
export type WhisperModel = ASRModel;
export type QuantizationType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'hybrid';
/** A single word with start/end times relative to the file */
export interface WordTimestamp {
    text: string;
    /** Start time in seconds, relative to the beginning of the file */
    start: number;
    /** End time in seconds, relative to the beginning of the file */
    end: number;
}
/** A single transcribed segment with text and file-relative timestamps */
export interface TranscriptSegment {
    text: string;
    /** Start time in seconds, relative to the beginning of the file */
    start: number;
    /** End time in seconds, relative to the beginning of the file */
    end: number;
    /** Per-word timestamps when using a `*_timestamped` model */
    words?: WordTimestamp[];
}
/**
 * Progress event emitted during transcription.
 * Named `TranscribeProgress` to avoid collision with the browser's ProgressEvent.
 */
export interface TranscribeProgress {
    stage: 'loading' | 'decoding' | 'transcribing' | 'done';
    /** 0–1 completion fraction */
    progress: number;
}
/** Options passed to `Transcriber.transcribe()` */
export interface TranscribeOptions {
    /** Model to use for transcription (default: 'whisper-tiny') */
    model?: ASRModel;
    /** Model precision format affecting speed vs accuracy (default: 'hybrid') */
    quantization?: QuantizationType;
    /** BCP-47 language code, e.g. 'en' or 'fr' (default: auto-detect) */
    language?: string;
    /** Called for each segment as it is transcribed */
    onSegment?: (segment: TranscriptSegment) => void;
    /** Called with progress updates during decoding and transcription */
    onProgress?: (event: TranscribeProgress) => void;
}
/** Options passed to `BrowserWhisper.downloadModel()` */
export interface DownloadModelOptions {
    /** Model to download and load (default: 'whisper-tiny') */
    model?: ASRModel;
    /** Model precision format affecting speed vs accuracy (default: 'hybrid') */
    quantization?: QuantizationType;
    /** Called with progress updates during model download/load */
    onProgress?: (event: TranscribeProgress) => void;
    /** Cancels an in-flight model download/load when aborted */
    signal?: AbortSignal;
}
/** A chunk of mono 16-kHz PCM samples transferred between workers */
export interface PCMChunk {
    /** Mono Float32 samples at 16 kHz */
    samples: Float32Array;
    /** Start time of this chunk in seconds, relative to the file beginning */
    timestamp: number;
    /** True when this is the last chunk in the stream */
    final: boolean;
}
export type DecoderMessage = {
    type: 'init';
    file: File;
} | {
    type: 'port';
    port: MessagePort;
};
export type ASRWorkerMessage = {
    type: 'init';
    model: ASRModel;
    language?: string;
    quantization?: QuantizationType;
} | {
    type: 'port';
    port: MessagePort;
};
export type MainThreadMessage = {
    type: 'segment';
    segment: TranscriptSegment;
} | {
    type: 'progress';
    event: TranscribeProgress;
} | {
    type: 'ready';
} | {
    type: 'done';
} | {
    type: 'error';
    message: string;
};
//# sourceMappingURL=types.d.ts.map