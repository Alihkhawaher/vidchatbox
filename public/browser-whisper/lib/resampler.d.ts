/**
 * Downmix multi-channel planar PCM to mono by averaging all channels.
 *
 * @param channels - One Float32Array per audio channel (planar layout,
 *   as returned by AudioData.copyTo with a planeIndex per channel).
 * @returns A new mono Float32Array.
 */
export declare function downmixToMono(channels: Float32Array[]): Float32Array;
/**
 * Resample a mono 16-bit PCM buffer to exactly 16 000 Hz using linear
 * interpolation. This is sufficient quality for Whisper — which was trained
 * on 16 kHz audio — without requiring a polyphase filter.
 *
 * @param input - Mono PCM samples at `sourceSampleRate`.
 * @param sourceSampleRate - Source sample rate in Hz.
 * @returns A new Float32Array at 16 000 Hz.
 */
export declare function resampleTo16kHz(input: Float32Array, sourceSampleRate: number): Float32Array;
//# sourceMappingURL=resampler.d.ts.map