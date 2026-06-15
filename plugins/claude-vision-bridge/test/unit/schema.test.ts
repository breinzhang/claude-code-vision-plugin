import { describe, expect, it } from 'vitest';
import {
  AnalyzeImageRequestSchema,
  FailureArtifactSchema,
  PluginConfigSchema,
  VisionArtifactSchema,
} from '../../src/core/schema.js';
import { loadConfig } from '../../src/config/load-config.js';

describe('shared schemas', () => {
  it('accepts path, url, clipboard, and base64 sources', () => {
    const sources = [
      { type: 'path', path: '/Users/alice/Desktop/a.png', origin: 'hook' },
      { type: 'url', url: 'https://example.com/a.png', origin: 'mcp' },
      { type: 'clipboard', origin: 'hook' },
      { type: 'base64', mime: 'image/png', data: 'iVBORw0KGgo=', origin: 'mcp' },
    ];

    for (const source of sources) {
      const parsed = AnalyzeImageRequestSchema.parse({
        source,
        mode: 'general',
        prompt: 'describe image',
        timeoutMs: 30000,
        maxOutputChars: 8000,
      });
      expect(parsed.source.type).toBe(source.type);
    }
  });

  it('rejects base64 sources from hook origin', () => {
    expect(() =>
      AnalyzeImageRequestSchema.parse({
        source: { type: 'base64', mime: 'image/png', data: 'iVBORw0KGgo=', origin: 'hook' },
      }),
    ).toThrow();
  });

  it('loads default config with remote fallback disabled', () => {
    const config = PluginConfigSchema.parse({});
    expect(config.allowRemoteFallback).toBe(false);
    expect(config.allowHttpUrls).toBe(false);
    expect(config.allowPrivateNetworkUrls).toBe(false);
    expect(config.providerOrder).toEqual(['ollama', 'omlx', 'llama_cpp', 'remote_openai']);
  });

  it('rejects numeric config values outside the plugin manifest bounds', () => {
    expect(() => PluginConfigSchema.parse({ maxImageBytes: 1023 })).toThrow();
    expect(() => PluginConfigSchema.parse({ maxImageBytes: 52428801 })).toThrow();
    expect(() => PluginConfigSchema.parse({ hookTimeoutMs: 999 })).toThrow();
    expect(() => PluginConfigSchema.parse({ hookTimeoutMs: 30001 })).toThrow();
    expect(() => PluginConfigSchema.parse({ providerTimeoutMs: 999 })).toThrow();
    expect(() => PluginConfigSchema.parse({ providerTimeoutMs: 60001 })).toThrow();
    expect(() => PluginConfigSchema.parse({ mcpTimeoutMs: 999 })).toThrow();
    expect(() => PluginConfigSchema.parse({ mcpTimeoutMs: 120001 })).toThrow();
    expect(() => PluginConfigSchema.parse({ maxOutputChars: 999 })).toThrow();
    expect(() => PluginConfigSchema.parse({ maxOutputChars: 10001 })).toThrow();
  });

  it('loads plugin config from Claude plugin environment options', () => {
    const config = loadConfig({
      CLAUDE_PLUGIN_ROOT: '/plugin',
      CLAUDE_PLUGIN_DATA: '/plugin-data',
      CLAUDE_PLUGIN_OPTION_PROVIDER_ORDER: 'remote_openai,ollama',
      CLAUDE_PLUGIN_OPTION_ALLOW_REMOTE_FALLBACK: 'true',
      CLAUDE_PLUGIN_OPTION_ALLOW_HTTP_URLS: '1',
      CLAUDE_PLUGIN_OPTION_ALLOWED_DIRECTORIES: '/Users/alice,/tmp',
      CLAUDE_PLUGIN_OPTION_REMOTE_OPENAI_BASE_URL: 'https://vision.example/v1',
      CLAUDE_PLUGIN_OPTION_REMOTE_OPENAI_MODEL: 'gpt-4.1-mini',
      CLAUDE_PLUGIN_OPTION_REMOTE_OPENAI_API_KEY: 'secret',
      CLAUDE_PLUGIN_OPTION_MAX_OUTPUT_CHARS: '4096',
    });

    expect(config.pluginRoot).toBe('/plugin');
    expect(config.pluginDataDir).toBe('/plugin-data');
    expect(config.providerOrder).toEqual(['remote_openai', 'ollama']);
    expect(config.allowRemoteFallback).toBe(true);
    expect(config.allowHttpUrls).toBe(true);
    expect(config.allowedDirectories).toEqual(['/Users/alice', '/tmp']);
    expect(config.maxOutputChars).toBe(4096);
    expect(config.providers.remote_openai).toMatchObject({
      baseUrl: 'https://vision.example/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'secret',
      enabled: true,
      remote: true,
    });
  });

  it('accepts success and failure artifact envelopes', () => {
    expect(
      VisionArtifactSchema.parse({
        artifactType: 'success',
        schemaVersion: 'vision-artifact.v1',
        source: {
          type: 'path',
          originalRef: './a.png',
          sha256: 'a'.repeat(64),
          mime: 'image/png',
          bytes: 67,
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
          mode: 'general',
          intentSummary: 'A UI screenshot',
          observations: ['A dialog is visible'],
          likelyTechnicalCauses: [],
          recommendedCodeSearches: [],
          redactions: [],
          modelLimitations: [],
        },
        markdown: '## Vision Analysis',
      }),
    ).toBeTruthy();

    expect(
      FailureArtifactSchema.parse({
        artifactType: 'failure',
        schemaVersion: 'vision-failure.v1',
        failure: {
          category: 'REMOTE_DISABLED',
          message: 'Remote fallback is disabled.',
          attemptedProviders: [],
          remoteFallbackAllowed: false,
        },
        recommendedNextSteps: ['Start a local VLM provider.'],
        markdown: '## Vision Analysis Failed',
      }),
    ).toBeTruthy();
  });
});
