import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeImageResult, PluginConfig } from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  analyzeOne: vi.fn(),
  constructorConfigs: [] as unknown[],
  loadConfig: vi.fn(),
  cacheClear: vi.fn(),
  cacheConstructorOptions: [] as unknown[],
}));

vi.mock('../../src/core/vision-service.js', () => ({
  VisionService: vi.fn(function VisionServiceMock(config: unknown) {
    mocks.constructorConfigs.push(config);
    return { analyzeOne: mocks.analyzeOne };
  }),
}));

vi.mock('../../src/config/load-config.js', () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock('../../src/cache/cache-manager.js', () => ({
  CacheManager: vi.fn(function CacheManagerMock(options: unknown) {
    mocks.cacheConstructorOptions.push(options);
    return { clear: mocks.cacheClear };
  }),
}));

import {
  AnalyzeImageToolInputSchema,
  handleAnalyzeImageResult,
  handleMcpToolCall,
  listVisionTools,
  sanitizeDoctorOutput,
} from '../../src/mcp/server.js';
import { buildFailureArtifact } from '../../src/failure/failure-artifact.js';

describe('MCP server handlers', () => {
  afterEach(() => {
    mocks.analyzeOne.mockReset();
    mocks.constructorConfigs.length = 0;
    mocks.loadConfig.mockReset();
    mocks.cacheClear.mockReset();
    mocks.cacheConstructorOptions.length = 0;
  });

  it('exposes the vision MCP tools', () => {
    expect(listVisionTools().map((tool) => tool.name)).toEqual([
      'analyze_image',
      'doctor_providers',
      'clear_vision_cache',
    ]);
  });

  it('validates analyze_image path/url/clipboard/base64 source inputs', () => {
    expect(AnalyzeImageToolInputSchema.parse({ source: { type: 'clipboard' } }).source.type).toBe('clipboard');
    expect(AnalyzeImageToolInputSchema.parse({ source: { type: 'url', url: 'https://example.com/a.png' } }).source.type).toBe(
      'url',
    );
    expect(AnalyzeImageToolInputSchema.parse({ source: { type: 'path', path: './a.png' } }).source.type).toBe(
      'path',
    );
    expect(AnalyzeImageToolInputSchema.parse({ source: { type: 'base64', mime: 'image/png', data: 'abc' } }).source.type).toBe(
      'base64',
    );
  });

  it('calls VisionService.analyzeOne with an MCP-origin analyze request', async () => {
    const config = pluginConfig();
    mocks.loadConfig.mockReturnValue(config);
    mocks.analyzeOne.mockResolvedValue(successArtifact());

    const result = await handleMcpToolCall({
      name: 'analyze_image',
      arguments: {
        source: { type: 'base64', mime: 'image/png', data: 'aW1n' },
        mode: 'ocr',
        prompt: 'Read all visible text.',
        preferredProvider: 'ollama',
      },
    });

    expect(mocks.loadConfig).toHaveBeenCalledTimes(1);
    expect(mocks.constructorConfigs).toEqual([config]);
    expect(mocks.analyzeOne).toHaveBeenCalledWith(
      {
        source: { type: 'base64', mime: 'image/png', data: 'aW1n', origin: 'mcp' },
        mode: 'ocr',
        prompt: 'Read all visible text.',
        preferredProvider: 'ollama',
        timeoutMs: config.mcpTimeoutMs,
        maxOutputChars: config.maxOutputChars,
      },
      { cwd: process.cwd() },
    );
    expect(result.structuredContent?.artifactType).toBe('success');
  });

  it('returns FailureArtifact as business result content', () => {
    const artifact = buildFailureArtifact({
      category: 'REMOTE_DISABLED',
      message: 'Remote disabled',
      attemptedProviders: [],
      remoteFallbackAllowed: false,
    });

    const result = handleAnalyzeImageResult(artifact);

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Vision Analysis Failed');
    expect(result.structuredContent.artifactType).toBe('failure');
  });

  it('does not leak API keys, tokens, or secrets in doctor output', async () => {
    mocks.loadConfig.mockReturnValue(pluginConfig());

    const result = await handleMcpToolCall({ name: 'doctor_providers', arguments: {} });
    const manualOutput = sanitizeDoctorOutput({
      nested: {
        token: 'token-value',
        clientSecret: 'secret-value',
      },
      remote_openai_api_key: 'sk-secret',
      message: 'authorization: Bearer token-value',
      configured: true,
    });
    const serialized = `${JSON.stringify(result)} ${JSON.stringify(manualOutput)}`;

    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('token-value');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).toContain('providerOrder');
    expect(serialized).toContain('configured');
  });

  it('clears the requested vision cache kind', async () => {
    const config = pluginConfig();
    mocks.loadConfig.mockReturnValue(config);

    const result = await handleMcpToolCall({
      name: 'clear_vision_cache',
      arguments: { kind: 'failure' },
    });

    expect(mocks.cacheConstructorOptions).toEqual([{ dataDir: config.pluginDataDir }]);
    expect(mocks.cacheClear).toHaveBeenCalledWith('failure');
    expect(result.structuredContent).toEqual({ cleared: 'failure' });
  });
});

function pluginConfig(): PluginConfig {
  return {
    pluginRoot: '/plugin',
    pluginDataDir: '/tmp/vision-data',
    providerOrder: ['ollama', 'omlx', 'llama_cpp', 'remote_openai'],
    allowRemoteFallback: true,
    allowHttpUrls: false,
    allowPrivateNetworkUrls: false,
    allowedDirectories: [],
    deniedDirectories: [],
    maxImageBytes: 10_485_760,
    hookTimeoutMs: 30_000,
    providerTimeoutMs: 20_000,
    mcpTimeoutMs: 12_345,
    maxOutputChars: 4_321,
    providers: {
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
        baseUrl: 'https://api.example.test/v1',
        model: 'gpt-4o-mini',
        apiKey: 'sk-secret',
        enabled: true,
        remote: true,
      },
    },
  };
}

function successArtifact(): AnalyzeImageResult {
  return {
    artifactType: 'success',
    schemaVersion: 'vision-artifact.v1',
    source: {
      type: 'base64',
      originalRef: 'base64:image/png',
      sha256: 'a'.repeat(64),
      mime: 'image/png',
      bytes: 3,
    },
    provider: {
      id: 'ollama',
      model: 'llava',
      fallbackDepth: 0,
    },
    timings: {
      startedAt: '2026-06-14T00:00:00.000Z',
      completedAt: '2026-06-14T00:00:01.000Z',
      latencyMs: 1000,
      cacheHit: false,
    },
    analysis: {
      schemaVersion: 'vision.v1',
      mode: 'ocr',
      intentSummary: 'Text screenshot.',
      observations: ['Text is visible.'],
      likelyTechnicalCauses: [],
      recommendedCodeSearches: [],
      redactions: [],
      modelLimitations: [],
    },
    markdown: '## Vision\n\nText screenshot.',
  };
}
