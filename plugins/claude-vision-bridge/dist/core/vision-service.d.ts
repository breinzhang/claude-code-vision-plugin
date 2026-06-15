import type { AnalyzeImageRequest, AnalyzeImageResult, PluginConfig } from './types.js';
export declare class VisionService {
    private readonly config;
    private readonly cache;
    constructor(config: PluginConfig);
    analyzeOne(request: AnalyzeImageRequest, context: {
        cwd: string;
    }): Promise<AnalyzeImageResult>;
    analyzeMany(requests: AnalyzeImageRequest[], context: {
        cwd: string;
    }): Promise<AnalyzeImageResult[]>;
    private resolveSource;
}
