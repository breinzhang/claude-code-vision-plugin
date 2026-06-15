import { z } from 'zod';
export declare const ProviderIdSchema: z.ZodEnum<{
    ollama: "ollama";
    omlx: "omlx";
    llama_cpp: "llama_cpp";
    remote_openai: "remote_openai";
}>;
export declare const VisionModeSchema: z.ZodEnum<{
    general: "general";
    ui: "ui";
    ocr: "ocr";
    error: "error";
    chart: "chart";
    "document-screenshot": "document-screenshot";
}>;
export declare const ImageSourceSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"path">;
    path: z.ZodString;
    origin: z.ZodEnum<{
        hook: "hook";
        mcp: "mcp";
    }>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"url">;
    url: z.ZodString;
    origin: z.ZodEnum<{
        hook: "hook";
        mcp: "mcp";
    }>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"clipboard">;
    origin: z.ZodEnum<{
        hook: "hook";
        mcp: "mcp";
    }>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"base64">;
    mime: z.ZodString;
    data: z.ZodString;
    origin: z.ZodLiteral<"mcp">;
}, z.core.$strip>], "type">;
export declare const AnalyzeImageRequestSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"path">;
        path: z.ZodString;
        origin: z.ZodEnum<{
            hook: "hook";
            mcp: "mcp";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"url">;
        url: z.ZodString;
        origin: z.ZodEnum<{
            hook: "hook";
            mcp: "mcp";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"clipboard">;
        origin: z.ZodEnum<{
            hook: "hook";
            mcp: "mcp";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"base64">;
        mime: z.ZodString;
        data: z.ZodString;
        origin: z.ZodLiteral<"mcp">;
    }, z.core.$strip>], "type">;
    mode: z.ZodDefault<z.ZodEnum<{
        general: "general";
        ui: "ui";
        ocr: "ocr";
        error: "error";
        chart: "chart";
        "document-screenshot": "document-screenshot";
    }>>;
    prompt: z.ZodDefault<z.ZodString>;
    preferredProvider: z.ZodOptional<z.ZodEnum<{
        ollama: "ollama";
        omlx: "omlx";
        llama_cpp: "llama_cpp";
        remote_openai: "remote_openai";
    }>>;
    preferredModel: z.ZodOptional<z.ZodString>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
    maxOutputChars: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const VisionStructuredOutputSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"vision.v1">;
    mode: z.ZodEnum<{
        general: "general";
        ui: "ui";
        ocr: "ocr";
        error: "error";
        chart: "chart";
        "document-screenshot": "document-screenshot";
    }>;
    intentSummary: z.ZodString;
    observations: z.ZodArray<z.ZodString>;
    ocrText: z.ZodOptional<z.ZodString>;
    uiStructure: z.ZodOptional<z.ZodObject<{
        layout: z.ZodOptional<z.ZodString>;
        regions: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            role: z.ZodString;
            text: z.ZodOptional<z.ZodString>;
            bbox: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        }, z.core.$strip>>>;
        likelyIssue: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    chartSummary: z.ZodOptional<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        axes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        keyFindings: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    likelyTechnicalCauses: z.ZodArray<z.ZodString>;
    recommendedCodeSearches: z.ZodArray<z.ZodString>;
    redactions: z.ZodArray<z.ZodString>;
    modelLimitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const VisionArtifactSchema: z.ZodObject<{
    artifactType: z.ZodLiteral<"success">;
    schemaVersion: z.ZodLiteral<"vision-artifact.v1">;
    source: z.ZodObject<{
        type: z.ZodEnum<{
            path: "path";
            url: "url";
            clipboard: "clipboard";
            base64: "base64";
        }>;
        originalRef: z.ZodString;
        resolvedPath: z.ZodOptional<z.ZodString>;
        sha256: z.ZodString;
        mime: z.ZodString;
        bytes: z.ZodNumber;
    }, z.core.$strip>;
    provider: z.ZodObject<{
        id: z.ZodEnum<{
            ollama: "ollama";
            omlx: "omlx";
            llama_cpp: "llama_cpp";
            remote_openai: "remote_openai";
        }>;
        model: z.ZodString;
        endpoint: z.ZodOptional<z.ZodString>;
        fallbackDepth: z.ZodNumber;
    }, z.core.$strip>;
    timings: z.ZodObject<{
        startedAt: z.ZodString;
        completedAt: z.ZodString;
        latencyMs: z.ZodNumber;
        cacheHit: z.ZodBoolean;
    }, z.core.$strip>;
    analysis: z.ZodObject<{
        schemaVersion: z.ZodLiteral<"vision.v1">;
        mode: z.ZodEnum<{
            general: "general";
            ui: "ui";
            ocr: "ocr";
            error: "error";
            chart: "chart";
            "document-screenshot": "document-screenshot";
        }>;
        intentSummary: z.ZodString;
        observations: z.ZodArray<z.ZodString>;
        ocrText: z.ZodOptional<z.ZodString>;
        uiStructure: z.ZodOptional<z.ZodObject<{
            layout: z.ZodOptional<z.ZodString>;
            regions: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                role: z.ZodString;
                text: z.ZodOptional<z.ZodString>;
                bbox: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>>>;
            likelyIssue: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        chartSummary: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            axes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            keyFindings: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        likelyTechnicalCauses: z.ZodArray<z.ZodString>;
        recommendedCodeSearches: z.ZodArray<z.ZodString>;
        redactions: z.ZodArray<z.ZodString>;
        modelLimitations: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    markdown: z.ZodString;
}, z.core.$strip>;
export declare const FailureCategorySchema: z.ZodEnum<{
    NO_VALID_IMAGE: "NO_VALID_IMAGE";
    PATH_POLICY_DENIED: "PATH_POLICY_DENIED";
    URL_POLICY_DENIED: "URL_POLICY_DENIED";
    CLIPBOARD_UNAVAILABLE: "CLIPBOARD_UNAVAILABLE";
    CLIPBOARD_EMPTY: "CLIPBOARD_EMPTY";
    INVALID_BASE64: "INVALID_BASE64";
    LOCAL_PROVIDERS_FAILED: "LOCAL_PROVIDERS_FAILED";
    REMOTE_DISABLED: "REMOTE_DISABLED";
    REMOTE_FAILED: "REMOTE_FAILED";
    PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT";
    MALFORMED_RESPONSE: "MALFORMED_RESPONSE";
    INTERNAL_ERROR: "INTERNAL_ERROR";
}>;
export declare const FailureArtifactSchema: z.ZodObject<{
    artifactType: z.ZodLiteral<"failure">;
    schemaVersion: z.ZodLiteral<"vision-failure.v1">;
    source: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<{
            path: "path";
            url: "url";
            clipboard: "clipboard";
            base64: "base64";
        }>;
        originalRef: z.ZodString;
        resolvedPath: z.ZodOptional<z.ZodString>;
        sha256: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    failure: z.ZodObject<{
        category: z.ZodEnum<{
            NO_VALID_IMAGE: "NO_VALID_IMAGE";
            PATH_POLICY_DENIED: "PATH_POLICY_DENIED";
            URL_POLICY_DENIED: "URL_POLICY_DENIED";
            CLIPBOARD_UNAVAILABLE: "CLIPBOARD_UNAVAILABLE";
            CLIPBOARD_EMPTY: "CLIPBOARD_EMPTY";
            INVALID_BASE64: "INVALID_BASE64";
            LOCAL_PROVIDERS_FAILED: "LOCAL_PROVIDERS_FAILED";
            REMOTE_DISABLED: "REMOTE_DISABLED";
            REMOTE_FAILED: "REMOTE_FAILED";
            PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT";
            MALFORMED_RESPONSE: "MALFORMED_RESPONSE";
            INTERNAL_ERROR: "INTERNAL_ERROR";
        }>;
        message: z.ZodString;
        attemptedProviders: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            status: z.ZodEnum<{
                skipped: "skipped";
                failed: "failed";
                timeout: "timeout";
                circuit_open: "circuit_open";
            }>;
            reason: z.ZodString;
        }, z.core.$strip>>;
        remoteFallbackAllowed: z.ZodBoolean;
    }, z.core.$strip>;
    recommendedNextSteps: z.ZodArray<z.ZodString>;
    markdown: z.ZodString;
}, z.core.$strip>;
export declare const PluginConfigSchema: z.ZodObject<{
    pluginRoot: z.ZodDefault<z.ZodString>;
    pluginDataDir: z.ZodDefault<z.ZodString>;
    providerOrder: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        ollama: "ollama";
        omlx: "omlx";
        llama_cpp: "llama_cpp";
        remote_openai: "remote_openai";
    }>>>;
    allowRemoteFallback: z.ZodDefault<z.ZodBoolean>;
    allowHttpUrls: z.ZodDefault<z.ZodBoolean>;
    allowPrivateNetworkUrls: z.ZodDefault<z.ZodBoolean>;
    allowedDirectories: z.ZodDefault<z.ZodArray<z.ZodString>>;
    deniedDirectories: z.ZodDefault<z.ZodArray<z.ZodString>>;
    maxImageBytes: z.ZodDefault<z.ZodNumber>;
    hookTimeoutMs: z.ZodDefault<z.ZodNumber>;
    providerTimeoutMs: z.ZodDefault<z.ZodNumber>;
    mcpTimeoutMs: z.ZodDefault<z.ZodNumber>;
    maxOutputChars: z.ZodDefault<z.ZodNumber>;
    providers: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
        ollama: "ollama";
        omlx: "omlx";
        llama_cpp: "llama_cpp";
        remote_openai: "remote_openai";
    }>, z.ZodObject<{
        id: z.ZodEnum<{
            ollama: "ollama";
            omlx: "omlx";
            llama_cpp: "llama_cpp";
            remote_openai: "remote_openai";
        }>;
        baseUrl: z.ZodString;
        model: z.ZodString;
        apiKey: z.ZodOptional<z.ZodString>;
        enabled: z.ZodBoolean;
        remote: z.ZodBoolean;
    }, z.core.$strip>>>;
}, z.core.$strip>;
