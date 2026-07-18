/** Base error class for all browser-whisper errors */
export declare class BrowserWhisperError extends Error {
    constructor(message: string);
}
/** Thrown when the browser does not support WebCodecs */
export declare class WebCodecsNotSupportedError extends BrowserWhisperError {
    constructor();
}
/** Thrown when the input file's audio codec cannot be decoded */
export declare class CodecNotSupportedError extends BrowserWhisperError {
    constructor(codec: string);
}
/** Thrown when the transformers.js model fails to load */
export declare class ModelLoadError extends BrowserWhisperError {
    constructor(modelId: string, cause?: unknown);
}
/** Thrown when WebCodecs fails during decoding */
export declare class DecoderError extends BrowserWhisperError {
    constructor(message: string, cause?: unknown);
}
/** Thrown when the input file has no audio track */
export declare class NoAudioTrackError extends BrowserWhisperError {
    constructor();
}
//# sourceMappingURL=errors.d.ts.map