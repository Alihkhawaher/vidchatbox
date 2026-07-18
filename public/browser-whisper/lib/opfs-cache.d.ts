interface OPFSCacheOptions {
    legacyCacheName: string;
    modelIds?: string[];
    rootName?: string;
}
interface DeleteModelCacheOptions extends OPFSCacheOptions {
    modelId: string;
}
interface CacheLike {
    match(request: RequestInfo | URL): Promise<Response | undefined>;
    put(request: RequestInfo | URL, response: Response): Promise<void>;
}
/**
 * OPFS-backed cache implementing the subset of the Web Cache API used by
 * transformers.js. It reads OPFS first, migrates legacy Cache API entries on
 * demand, and lets transformers.js fetch remotely when both caches miss.
 */
export declare function createOPFSCache(options: OPFSCacheOptions): CacheLike;
/** Remove all browser-whisper model files stored in OPFS and the legacy cache. */
export declare function clearOPFSCache(options: OPFSCacheOptions): Promise<void>;
/** Remove cached files for a single Hugging Face model ID. */
export declare function deleteModelFromOPFSCache(options: DeleteModelCacheOptions): Promise<void>;
export {};
//# sourceMappingURL=opfs-cache.d.ts.map