import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../cache/cache-manager.js';
import { loadConfig } from '../config/load-config.js';
import { AnalyzeImageRequestSchema } from '../core/schema.js';
import type { AnalyzeImageResult, PluginConfig } from '../core/types.js';
import { VisionService } from '../core/vision-service.js';

export const AnalyzeImageToolInputSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('path'), path: z.string().min(1) }),
    z.object({ type: z.literal('url'), url: z.string().url() }),
    z.object({ type: z.literal('clipboard') }),
    z.object({ type: z.literal('base64'), mime: z.string().min(1), data: z.string().min(1) }),
  ]),
  mode: z.enum(['general', 'ui', 'ocr', 'error', 'chart', 'document-screenshot']).default('general'),
  prompt: z.string().default('Describe the image for a coding agent.'),
  preferredProvider: z.enum(['ollama', 'omlx', 'llama_cpp', 'remote_openai']).optional(),
  preferredModel: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxOutputChars: z.number().int().positive().optional(),
});

export const ClearVisionCacheToolInputSchema = z.object({
  kind: z.enum(['all', 'success', 'failure']).default('all'),
});

type ToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

type TextToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
};

type AnalyzeImageToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: AnalyzeImageResult;
};

const sensitiveKeyPattern = /api[_-]?key|token|secret|authorization/i;

export function listVisionTools(): Tool[] {
  return [
    {
      name: 'analyze_image',
      description: 'Analyze an image from a local path, URL, system clipboard, or base64 payload.',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'object',
            oneOf: [
              {
                type: 'object',
                properties: { type: { const: 'path' }, path: { type: 'string', minLength: 1 } },
                required: ['type', 'path'],
              },
              {
                type: 'object',
                properties: { type: { const: 'url' }, url: { type: 'string', format: 'uri' } },
                required: ['type', 'url'],
              },
              {
                type: 'object',
                properties: { type: { const: 'clipboard' } },
                required: ['type'],
              },
              {
                type: 'object',
                properties: {
                  type: { const: 'base64' },
                  mime: { type: 'string', minLength: 1 },
                  data: { type: 'string', minLength: 1 },
                },
                required: ['type', 'mime', 'data'],
              },
            ],
          },
          mode: {
            type: 'string',
            enum: ['general', 'ui', 'ocr', 'error', 'chart', 'document-screenshot'],
          },
          prompt: { type: 'string' },
          preferredProvider: {
            type: 'string',
            enum: ['ollama', 'omlx', 'llama_cpp', 'remote_openai'],
          },
          preferredModel: { type: 'string' },
          timeoutMs: { type: 'number' },
          maxOutputChars: { type: 'number' },
        },
        required: ['source'],
      },
    },
    {
      name: 'doctor_providers',
      description: 'Inspect provider, remote fallback, cache, and runtime configuration status.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'clear_vision_cache',
      description: 'Clear success or failure vision cache entries.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['all', 'success', 'failure'] },
        },
      },
    },
  ];
}

export function handleAnalyzeImageResult(result: AnalyzeImageResult): AnalyzeImageToolResult {
  return {
    content: [{ type: 'text', text: result.markdown }],
    structuredContent: result,
  };
}

export function sanitizeDoctorOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeDoctorOutput(item));

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sensitiveKeyPattern.test(key) ? configuredMarker(item) : sanitizeDoctorOutput(item);
    }
    return output;
  }

  if (typeof value === 'string') return redactSensitiveString(value);

  return value;
}

export async function handleMcpToolCall(call: ToolCall): Promise<TextToolResult | AnalyzeImageToolResult> {
  if (call.name === 'analyze_image') {
    const config = loadConfig();
    const input = AnalyzeImageToolInputSchema.parse(call.arguments ?? {});
    const analyzeRequest = AnalyzeImageRequestSchema.parse({
      ...input,
      source: { ...input.source, origin: 'mcp' },
      timeoutMs: input.timeoutMs ?? config.mcpTimeoutMs,
      maxOutputChars: input.maxOutputChars ?? config.maxOutputChars,
    });
    const result = await new VisionService(config).analyzeOne(analyzeRequest, { cwd: process.cwd() });
    return handleAnalyzeImageResult(result);
  }

  if (call.name === 'doctor_providers') {
    const output = sanitizeDoctorOutput(buildDoctorOutput(loadConfig())) as Record<string, unknown>;
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }

  if (call.name === 'clear_vision_cache') {
    const config = loadConfig();
    const input = ClearVisionCacheToolInputSchema.parse(call.arguments ?? {});
    new CacheManager({ dataDir: config.pluginDataDir }).clear(input.kind);
    return {
      content: [{ type: 'text', text: `Cleared ${input.kind} vision cache.` }],
      structuredContent: { cleared: input.kind },
    };
  }

  throw new Error(`Unknown MCP tool: ${call.name}`);
}

export async function createMcpServer(): Promise<Server> {
  const server = new Server(
    { name: 'vision-bridge', version: '0.1.6' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listVisionTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handleMcpToolCall({
      name: request.params.name,
      arguments: request.params.arguments,
    });
    return result as CallToolResult;
  });

  return server;
}

function buildDoctorOutput(config: PluginConfig): Record<string, unknown> {
  return {
    version: '0.1.6',
    providerOrder: config.providerOrder,
    remoteFallback: config.allowRemoteFallback,
    pluginDataDir: config.pluginDataDir,
    maxImageBytes: config.maxImageBytes,
    providerTimeoutMs: config.providerTimeoutMs,
    mcpTimeoutMs: config.mcpTimeoutMs,
    providers: config.providers,
  };
}

function configuredMarker(value: unknown): string {
  if (value === undefined || value === null || value === '') return '[not configured]';
  return '[configured]';
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\b(bearer\s+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\b(api[_-]?key|token|secret)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]');
}

async function main(): Promise<void> {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
