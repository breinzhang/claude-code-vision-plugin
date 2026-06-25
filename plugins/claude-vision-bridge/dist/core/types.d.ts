export type ProviderId = 'ollama' | 'omlx' | 'llama_cpp' | 'remote_openai';
export type VisionMode = 'general' | 'ui' | 'ocr' | 'error' | 'chart' | 'document-screenshot';
export type ImageSourceOrigin = 'hook' | 'mcp';
export type ImageSource = {
    type: 'path';
    path: string;
    origin: ImageSourceOrigin;
} | {
    type: 'url';
    url: string;
    origin: ImageSourceOrigin;
} | {
    type: 'clipboard';
    origin: ImageSourceOrigin;
} | {
    type: 'base64';
    mime: string;
    data: string;
    origin: 'mcp';
};
export type FailureCategory = 'NO_VALID_IMAGE' | 'PATH_POLICY_DENIED' | 'URL_POLICY_DENIED' | 'CLIPBOARD_UNAVAILABLE' | 'CLIPBOARD_EMPTY' | 'INVALID_BASE64' | 'LOCAL_PROVIDERS_FAILED' | 'REMOTE_DISABLED' | 'REMOTE_FAILED' | 'PROVIDER_TIMEOUT' | 'MALFORMED_RESPONSE' | 'INTERNAL_ERROR';
export interface AnalyzeImageRequest {
    source: ImageSource;
    mode: VisionMode;
    prompt: string;
    preferredProvider?: ProviderId;
    preferredModel?: string;
    timeoutMs: number;
    maxOutputChars: number;
}
export interface ResolvedImageSource {
    type: ImageSource['type'];
    originalRef: string;
    resolvedPath?: string;
    bytes: Buffer;
    sha256: string;
    mime: string;
    ext: string;
}
export interface VisionStructuredOutput {
    schemaVersion: 'vision.v1';
    mode: VisionMode;
    intentSummary: string;
    observations: string[];
    ocrText?: string;
    uiStructure?: {
        layout?: string;
        regions?: Array<{
            name: string;
            role: string;
            text?: string;
            bbox?: [number, number, number, number];
        }>;
        likelyIssue?: string;
    };
    chartSummary?: {
        title?: string;
        axes?: string[];
        keyFindings?: string[];
    };
    likelyTechnicalCauses: string[];
    recommendedCodeSearches: string[];
    redactions: string[];
    modelLimitations: string[];
}
export interface VisionArtifact {
    artifactType: 'success';
    schemaVersion: 'vision-artifact.v1';
    source: {
        type: ImageSource['type'];
        originalRef: string;
        resolvedPath?: string;
        sha256: string;
        mime: string;
        bytes: number;
    };
    provider: {
        id: ProviderId;
        model: string;
        endpoint?: string;
        fallbackDepth: number;
    };
    timings: {
        startedAt: string;
        completedAt: string;
        latencyMs: number;
        cacheHit: boolean;
    };
    analysis: VisionStructuredOutput;
    markdown: string;
}
export interface FailureArtifact {
    artifactType: 'failure';
    schemaVersion: 'vision-failure.v1';
    source?: {
        type: ImageSource['type'];
        originalRef: string;
        resolvedPath?: string;
        sha256?: string;
    };
    failure: {
        category: FailureCategory;
        message: string;
        attemptedProviders: Array<{
            id: string;
            status: 'skipped' | 'failed' | 'timeout' | 'circuit_open';
            reason: string;
        }>;
        remoteFallbackAllowed: boolean;
    };
    recommendedNextSteps: string[];
    markdown: string;
}
export type AnalyzeImageResult = VisionArtifact | FailureArtifact;
export interface ProviderConfig {
    id: ProviderId;
    baseUrl: string;
    model: string;
    apiKey?: string;
    enabled: boolean;
    remote: boolean;
}
export interface PluginConfig {
    pluginRoot: string;
    pluginDataDir: string;
    providerOrder: ProviderId[];
    allowRemoteFallback: boolean;
    allowHttpUrls: boolean;
    allowPrivateNetworkUrls: boolean;
    allowedDirectories: string[];
    deniedDirectories: string[];
    maxImageBytes: number;
    hookTimeoutMs: number;
    providerTimeoutMs: number;
    mcpTimeoutMs: number;
    maxOutputChars: number;
    mcpAnalyzeCommand: string;
    mcpDoctorCommand: string;
    mcpCleanCommand: string;
    mcpToolsCommand: string;
    providers: Record<ProviderId, ProviderConfig>;
}
