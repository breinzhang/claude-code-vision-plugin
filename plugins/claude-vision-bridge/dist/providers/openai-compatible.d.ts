import type { ProviderId } from '../core/types.js';
import { type ProviderAnalyzeRequest, type ProviderAnalyzeResult, type ProviderHealth, type VisionProvider } from './base.js';
export declare class OpenAICompatibleVisionProvider implements VisionProvider {
    readonly id: ProviderId;
    readonly baseUrl: string;
    readonly model: string;
    private readonly apiKey?;
    private readonly timeoutMs;
    constructor(options: {
        id: ProviderId;
        baseUrl: string;
        model: string;
        apiKey?: string;
        timeoutMs: number;
    });
    healthCheck(): Promise<ProviderHealth>;
    analyze(request: ProviderAnalyzeRequest): Promise<ProviderAnalyzeResult>;
    private fetchWithTimeout;
}
