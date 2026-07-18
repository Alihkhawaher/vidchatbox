import type { TranscriptSegment, WordTimestamp } from '../types.js';
/** Pipeline chunk shape when `return_timestamps` is enabled */
export interface TimestampChunk {
    text: string;
    timestamp: [number | null, number | null];
}
/** Map ASR pipeline chunks to file-relative words */
export declare function chunksToWords(chunks: TimestampChunk[], chunkOffsetSeconds: number): WordTimestamp[];
/** Group word-level timestamps into readable segments for display and streaming */
export declare function groupWordsIntoSegments(words: WordTimestamp[]): TranscriptSegment[];
//# sourceMappingURL=word-segments.d.ts.map