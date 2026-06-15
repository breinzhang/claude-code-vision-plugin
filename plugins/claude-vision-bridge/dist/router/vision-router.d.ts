import type { AnalyzeImageRequest, FailureArtifact, ResolvedImageSource, VisionArtifact } from '../core/types.js';
import { type VisionProvider } from '../providers/base.js';
export declare function runProviderLoop(input: {
    request: AnalyzeImageRequest;
    image: ResolvedImageSource;
    providers: VisionProvider[];
    remoteFallbackAllowed: boolean;
}): Promise<VisionArtifact | FailureArtifact>;
