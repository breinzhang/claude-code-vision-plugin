import type { FailureArtifact, VisionArtifact } from '../core/types.js';
export declare class CacheManager {
    private readonly options;
    constructor(options: {
        dataDir: string;
    });
    ensureDirs(): void;
    readSuccess(key: string): VisionArtifact | undefined;
    writeSuccess(key: string, artifact: VisionArtifact): void;
    readFailure(key: string, ttlMs: number): FailureArtifact | undefined;
    writeFailure(key: string, artifact: FailureArtifact): void;
    clear(kind: 'all' | 'success' | 'failure'): void;
}
