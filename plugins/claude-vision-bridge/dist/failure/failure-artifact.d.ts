import type { FailureArtifact, FailureCategory, ImageSource } from '../core/types.js';
export declare function buildFailureArtifact(input: {
    category: FailureCategory;
    message: string;
    source?: {
        type: ImageSource['type'];
        originalRef: string;
        resolvedPath?: string;
        sha256?: string;
    };
    attemptedProviders: FailureArtifact['failure']['attemptedProviders'];
    remoteFallbackAllowed: boolean;
}): FailureArtifact;
