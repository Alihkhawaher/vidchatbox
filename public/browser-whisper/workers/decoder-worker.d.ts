/**
 * decoder.worker.ts
 *
 * Runs in a Web Worker. Responsible for:
 *  1. Receiving a File and a MessagePort (pointed at the Whisper worker)
 *  2. Using MediaBunny to demux the file and obtain encoded audio packets
 *  3. Feeding those packets to a WebCodecs AudioDecoder for hardware-accelerated decoding
 *  4. Downmixing + resampling decoded AudioData frames to mono 16-kHz PCM
 *  5. Windowing the PCM into 30-second chunks via Chunker
 *  6. Transferring each chunk to the Whisper worker via the MessagePort
 *  7. Reporting decoding progress back to the main thread
 */
export {};
//# sourceMappingURL=decoder-worker.d.ts.map