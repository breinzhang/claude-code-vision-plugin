import { z } from 'zod';

export const ProviderIdSchema = z.enum(['ollama', 'omlx', 'llama_cpp', 'remote_openai']);
export const VisionModeSchema = z.enum(['general', 'ui', 'ocr', 'error', 'chart', 'document-screenshot']);

export const ImageSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('path'), path: z.string().min(1), origin: z.enum(['hook', 'mcp']) }),
  z.object({ type: z.literal('url'), url: z.string().url(), origin: z.enum(['hook', 'mcp']) }),
  z.object({ type: z.literal('clipboard'), origin: z.enum(['hook', 'mcp']) }),
  z.object({
    type: z.literal('base64'),
    mime: z.string().min(1),
    data: z.string().min(1),
    origin: z.literal('mcp'),
  }),
]);

export const AnalyzeImageRequestSchema = z.object({
  source: ImageSourceSchema,
  mode: VisionModeSchema.default('general'),
  prompt: z.string().default('Describe the image for a coding agent.'),
  preferredProvider: ProviderIdSchema.optional(),
  preferredModel: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().default(30000),
  maxOutputChars: z.number().int().positive().max(10000).default(8000),
});

export const VisionStructuredOutputSchema = z.object({
  schemaVersion: z.literal('vision.v1'),
  mode: VisionModeSchema,
  intentSummary: z.string(),
  observations: z.array(z.string()),
  ocrText: z.string().optional(),
  uiStructure: z
    .object({
      layout: z.string().optional(),
      regions: z
        .array(
          z.object({
            name: z.string(),
            role: z.string(),
            text: z.string().optional(),
            bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
          }),
        )
        .optional(),
      likelyIssue: z.string().optional(),
    })
    .optional(),
  chartSummary: z
    .object({
      title: z.string().optional(),
      axes: z.array(z.string()).optional(),
      keyFindings: z.array(z.string()).optional(),
    })
    .optional(),
  likelyTechnicalCauses: z.array(z.string()),
  recommendedCodeSearches: z.array(z.string()),
  redactions: z.array(z.string()),
  modelLimitations: z.array(z.string()),
});

export const VisionArtifactSchema = z.object({
  artifactType: z.literal('success'),
  schemaVersion: z.literal('vision-artifact.v1'),
  source: z.object({
    type: z.enum(['path', 'url', 'clipboard', 'base64']),
    originalRef: z.string(),
    resolvedPath: z.string().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime: z.string(),
    bytes: z.number().int().nonnegative(),
  }),
  provider: z.object({
    id: ProviderIdSchema,
    model: z.string(),
    endpoint: z.string().optional(),
    fallbackDepth: z.number().int().nonnegative(),
  }),
  timings: z.object({
    startedAt: z.string(),
    completedAt: z.string(),
    latencyMs: z.number().nonnegative(),
    cacheHit: z.boolean(),
  }),
  analysis: VisionStructuredOutputSchema,
  markdown: z.string(),
});

export const FailureCategorySchema = z.enum([
  'NO_VALID_IMAGE',
  'PATH_POLICY_DENIED',
  'URL_POLICY_DENIED',
  'CLIPBOARD_UNAVAILABLE',
  'CLIPBOARD_EMPTY',
  'INVALID_BASE64',
  'LOCAL_PROVIDERS_FAILED',
  'REMOTE_DISABLED',
  'REMOTE_FAILED',
  'PROVIDER_TIMEOUT',
  'MALFORMED_RESPONSE',
  'INTERNAL_ERROR',
]);

export const FailureArtifactSchema = z.object({
  artifactType: z.literal('failure'),
  schemaVersion: z.literal('vision-failure.v1'),
  source: z
    .object({
      type: z.enum(['path', 'url', 'clipboard', 'base64']),
      originalRef: z.string(),
      resolvedPath: z.string().optional(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    })
    .optional(),
  failure: z.object({
    category: FailureCategorySchema,
    message: z.string(),
    attemptedProviders: z.array(
      z.object({
        id: z.string(),
        status: z.enum(['skipped', 'failed', 'timeout', 'circuit_open']),
        reason: z.string(),
      }),
    ),
    remoteFallbackAllowed: z.boolean(),
  }),
  recommendedNextSteps: z.array(z.string()),
  markdown: z.string(),
});

const providerOrderDefault = ['ollama', 'omlx', 'llama_cpp', 'remote_openai'] as const;
const providerConfigSchema = z.object({
  id: ProviderIdSchema,
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  remote: z.boolean(),
});
const commandAliasSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const PluginConfigSchema = z
  .object({
    pluginRoot: z.string().default(process.cwd()),
    pluginDataDir: z.string().default('.vision-data'),
    providerOrder: z.array(ProviderIdSchema).default([...providerOrderDefault]),
    allowRemoteFallback: z.boolean().default(false),
    allowHttpUrls: z.boolean().default(false),
    allowPrivateNetworkUrls: z.boolean().default(false),
    allowedDirectories: z.array(z.string()).default([]),
    deniedDirectories: z.array(z.string()).default([]),
    maxImageBytes: z.number().int().min(1024).max(52428800).default(10485760),
    hookTimeoutMs: z.number().int().min(1000).max(30000).default(30000),
    providerTimeoutMs: z.number().int().min(1000).max(60000).default(20000),
    mcpTimeoutMs: z.number().int().min(1000).max(120000).default(60000),
    maxOutputChars: z.number().int().min(1000).max(10000).default(8000),
    mcpAnalyzeCommand: commandAliasSchema.default('analyze'),
    mcpDoctorCommand: commandAliasSchema.default('doctor'),
    mcpCleanCommand: commandAliasSchema.default('clean'),
    mcpToolsCommand: commandAliasSchema.default('tools'),
    providers: z.record(ProviderIdSchema, providerConfigSchema).default({
      ollama: {
        id: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llava',
        enabled: true,
        remote: false,
      },
      omlx: {
        id: 'omlx',
        baseUrl: 'http://127.0.0.1:8000/v1',
        model: 'mlx-vlm',
        enabled: true,
        remote: false,
      },
      llama_cpp: {
        id: 'llama_cpp',
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'llava',
        enabled: true,
        remote: false,
      },
      remote_openai: {
        id: 'remote_openai',
        baseUrl: '',
        model: '',
        enabled: false,
        remote: true,
      },
    }),
  })
  .superRefine((config, context) => {
    const aliases = [
      config.mcpAnalyzeCommand,
      config.mcpDoctorCommand,
      config.mcpCleanCommand,
      config.mcpToolsCommand,
    ];
    if (new Set(aliases).size !== aliases.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manual MCP command aliases must be unique.',
      });
    }
  });
