import type { PCMChunk } from '../types.js';
/** Callback invoked each time a full (or final) chunk is ready */
export type ChunkCallback = (chunk: PCMChunk) => void;
/**
 * Accumulates decoded mono 16-kHz PCM samples and emits them in 30-second
 * windows (CHUNK_SIZE = 480 000 samples) suitable for Whisper inference.
 *
 * Usage:
 *   const chunker = new Chunker(onChunk)
 *   chunker.push(samples)   // call as decoded audio arrives
 *   chunker.flush()         // call once decoding is complete
 */
export declare class Chunker {
    private readonly onChunk;
    /** Buffer of pending samples across multiple push() calls */
    private readonly buffer;
    /** Total samples accumulated in buffer */
    private bufferedSamples;
    /** Total samples emitted so far — used to compute chunk timestamps */
    private consumedSamples;
    constructor(onChunk: ChunkCallback);
    /**
     * Add decoded samples to the internal buffer.
     * Emits complete 30-second chunks as soon as they are available.
     */
    push(samples: Float32Array): void;
    /**
     * Flush remaining buffered samples as a final chunk.
     * Zero-pads to CHUNK_SIZE so Whisper always receives a full 30-second window.
     * Must be called exactly once, after all push() calls are done.
     */
    flush(): void;
    /** Pull exactly CHUNK_SIZE samples from the head of the buffer */
    private extractChunk;
    /** Pull all remaining samples from the buffer */
    private extractAll;
    /** Pull exactly `n` samples, concatenating across buffer slices */
    private extractN;
}
//# sourceMappingURL=chunker.d.ts.map