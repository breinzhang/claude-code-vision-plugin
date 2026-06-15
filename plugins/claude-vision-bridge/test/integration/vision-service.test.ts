import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VisionService } from '../../src/core/vision-service.js';
import type { AnalyzeImageRequest, PluginConfig, ProviderId } from '../../src/core/types.js';
import { tinyPng } from '../fixtures/images.js';
import { startHttpServer } from '../helpers/http-server.js';

describe('VisionService', () => {
  it('analyzes a path source through a local provider and marks the second result as a success cache hit', async () =>
    await withAsyncTempDir(async (dir) => {
      let calls = 0;
      const server = await startHttpServer((_req, res) => {
        calls += 1;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'A settings screen with an error banner.' } }] }));
      });

      try {
        const imagePath = join(dir, 'screen.png');
        writeFileSync(imagePath, tinyPng);
        const service = new VisionService(
          configFor(dir, {
            providerOrder: ['ollama'],
            providers: {
              ollama: { id: 'ollama', baseUrl: `${server.url}/v1`, model: 'llava', enabled: true, remote: false },
            },
          }),
        );

        const first = await service.analyzeOne(pathRequest(imagePath), { cwd: dir });
        const second = await service.analyzeOne(pathRequest(imagePath), { cwd: dir });

        expect(first.artifactType).toBe('success');
        expect(second.artifactType).toBe('success');
        if (first.artifactType === 'success' && second.artifactType === 'success') {
          expect(first.timings.cacheHit).toBe(false);
          expect(second.timings.cacheHit).toBe(true);
          expect(second.analysis.intentSummary).toBe('A settings screen with an error banner.');
        }
        expect(calls).toBe(1);
      } finally {
        await server.close();
      }
    }));

  it('partitions success cache entries by provider order', async () =>
    await withAsyncTempDir(async (dir) => {
      const imagePath = join(dir, 'screen.png');
      writeFileSync(imagePath, tinyPng);

      let ollamaCalls = 0;
      let omlxCalls = 0;
      const ollamaServer = await startHttpServer((_req, res) => {
        ollamaCalls += 1;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'Result from ollama.' } }] }));
      });
      const omlxServer = await startHttpServer((_req, res) => {
        omlxCalls += 1;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'Result from omlx.' } }] }));
      });

      try {
        const firstService = new VisionService(
          configFor(dir, {
            providerOrder: ['ollama', 'omlx'],
            providers: {
              ollama: { id: 'ollama', baseUrl: `${ollamaServer.url}/v1`, model: 'llava', enabled: true, remote: false },
              omlx: { id: 'omlx', baseUrl: `${omlxServer.url}/v1`, model: 'mlx-vlm', enabled: true, remote: false },
            },
          }),
        );
        const secondService = new VisionService(
          configFor(dir, {
            providerOrder: ['omlx', 'ollama'],
            providers: {
              ollama: { id: 'ollama', baseUrl: `${ollamaServer.url}/v1`, model: 'llava', enabled: true, remote: false },
              omlx: { id: 'omlx', baseUrl: `${omlxServer.url}/v1`, model: 'mlx-vlm', enabled: true, remote: false },
            },
          }),
        );

        const first = await firstService.analyzeOne(pathRequest(imagePath), { cwd: dir });
        const second = await secondService.analyzeOne(pathRequest(imagePath), { cwd: dir });

        expect(first.artifactType).toBe('success');
        expect(second.artifactType).toBe('success');
        if (first.artifactType === 'success' && second.artifactType === 'success') {
          expect(first.provider.id).toBe('ollama');
          expect(second.provider.id).toBe('omlx');
          expect(second.timings.cacheHit).toBe(false);
        }
        expect(ollamaCalls).toBe(1);
        expect(omlxCalls).toBe(1);
      } finally {
        await ollamaServer.close();
        await omlxServer.close();
      }
    }));

  it('tries providers in configured order before succeeding', async () =>
    await withAsyncTempDir(async (dir) => {
      const imagePath = join(dir, 'screen.png');
      writeFileSync(imagePath, tinyPng);
      const attempts: ProviderId[] = [];

      const failingServer = await startHttpServer((_req, res) => {
        attempts.push('omlx');
        res.statusCode = 500;
        res.end('broken');
      });
      const succeedingServer = await startHttpServer((_req, res) => {
        attempts.push('ollama');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'Fallback provider succeeded.' } }] }));
      });

      try {
        const service = new VisionService(
          configFor(dir, {
            providerOrder: ['omlx', 'ollama'],
            providers: {
              ollama: { id: 'ollama', baseUrl: `${succeedingServer.url}/v1`, model: 'llava', enabled: true, remote: false },
              omlx: { id: 'omlx', baseUrl: `${failingServer.url}/v1`, model: 'mlx-vlm', enabled: true, remote: false },
            },
          }),
        );

        const result = await service.analyzeOne(pathRequest(imagePath), { cwd: dir });

        expect(result.artifactType).toBe('success');
        if (result.artifactType === 'success') {
          expect(result.provider.id).toBe('ollama');
          expect(result.provider.fallbackDepth).toBe(1);
        }
        expect(attempts).toEqual(['omlx', 'ollama']);
      } finally {
        await failingServer.close();
        await succeedingServer.close();
      }
    }));

  it('honors preferredProvider before configured provider order', async () =>
    await withAsyncTempDir(async (dir) => {
      const imagePath = join(dir, 'screen.png');
      writeFileSync(imagePath, tinyPng);
      const attempts: ProviderId[] = [];

      const ollamaServer = await startHttpServer((_req, res) => {
        attempts.push('ollama');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'Unexpected first provider.' } }] }));
      });
      const omlxServer = await startHttpServer((_req, res) => {
        attempts.push('omlx');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'Preferred provider succeeded.' } }] }));
      });

      try {
        const service = new VisionService(
          configFor(dir, {
            providerOrder: ['ollama', 'omlx'],
            providers: {
              ollama: { id: 'ollama', baseUrl: `${ollamaServer.url}/v1`, model: 'llava', enabled: true, remote: false },
              omlx: { id: 'omlx', baseUrl: `${omlxServer.url}/v1`, model: 'mlx-vlm', enabled: true, remote: false },
            },
          }),
        );

        const result = await service.analyzeOne(
          { ...pathRequest(imagePath), preferredProvider: 'omlx' },
          { cwd: dir },
        );

        expect(result.artifactType).toBe('success');
        if (result.artifactType === 'success') {
          expect(result.provider.id).toBe('omlx');
          expect(result.provider.fallbackDepth).toBe(0);
        }
        expect(attempts).toEqual(['omlx']);
      } finally {
        await ollamaServer.close();
        await omlxServer.close();
      }
    }));

  it('returns and caches a failure artifact when local providers fail and remote fallback is disabled', async () =>
    await withAsyncTempDir(async (dir) => {
      const imagePath = join(dir, 'screen.png');
      writeFileSync(imagePath, tinyPng);
      let calls = 0;
      const server = await startHttpServer((_req, res) => {
        calls += 1;
        res.statusCode = 500;
        res.end('broken');
      });

      try {
        const service = new VisionService(
          configFor(dir, {
            providerOrder: ['ollama', 'remote_openai'],
            allowRemoteFallback: false,
            providers: {
              ollama: { id: 'ollama', baseUrl: `${server.url}/v1`, model: 'llava', enabled: true, remote: false },
              remote_openai: {
                id: 'remote_openai',
                baseUrl: 'https://remote.invalid/v1',
                model: 'gpt-vision',
                enabled: true,
                remote: true,
              },
            },
          }),
        );

        const first = await service.analyzeOne(pathRequest(imagePath), { cwd: dir });
        const second = await service.analyzeOne(pathRequest(imagePath), { cwd: dir });

        expect(first.artifactType).toBe('failure');
        expect(second.artifactType).toBe('failure');
        if (first.artifactType === 'failure' && second.artifactType === 'failure') {
          expect(first.failure.category).toBe('REMOTE_DISABLED');
          expect(first.failure.attemptedProviders).toEqual([
            expect.objectContaining({ id: 'ollama', status: 'failed' }),
          ]);
          expect(second.failure.category).toBe('REMOTE_DISABLED');
          expect(second.failure.attemptedProviders).toEqual(first.failure.attemptedProviders);
        }
        expect(calls).toBe(1);
      } finally {
        await server.close();
      }
    }));

  it.each([
    {
      name: 'path policy denial',
      requestFor: (dir: string): AnalyzeImageRequest => {
        const deniedDir = join(dir, 'denied');
        mkdirSync(deniedDir);
        const imagePath = join(deniedDir, 'screen.png');
        writeFileSync(imagePath, tinyPng);
        return pathRequest(imagePath);
      },
      configForCase: (dir: string): PluginConfig =>
        configFor(dir, {
          deniedDirectories: [join(dir, 'denied')],
        }),
      category: 'PATH_POLICY_DENIED',
    },
    {
      name: 'URL policy denial',
      requestFor: (): AnalyzeImageRequest => ({
        source: { type: 'url', url: 'http://127.0.0.1/not-allowed.png', origin: 'mcp' },
        mode: 'general',
        prompt: 'Describe',
        timeoutMs: 30000,
        maxOutputChars: 8000,
      }),
      configForCase: (dir: string): PluginConfig => configFor(dir),
      category: 'URL_POLICY_DENIED',
    },
    {
      name: 'invalid base64 image',
      requestFor: (): AnalyzeImageRequest => ({
        source: { type: 'base64', mime: 'image/png', data: Buffer.from('not an image').toString('base64'), origin: 'mcp' },
        mode: 'general',
        prompt: 'Describe',
        timeoutMs: 30000,
        maxOutputChars: 8000,
      }),
      configForCase: (dir: string): PluginConfig => configFor(dir),
      category: 'INVALID_BASE64',
    },
  ])('returns visible $category failure for $name', async ({ requestFor, configForCase, category }) =>
    await withAsyncTempDir(async (dir) => {
      const service = new VisionService(configForCase(dir));

      const result = await service.analyzeOne(requestFor(dir), { cwd: dir });

      expect(result.artifactType).toBe('failure');
      if (result.artifactType === 'failure') {
        expect(result.failure.category).toBe(category);
        expect(result.failure.attemptedProviders).toEqual([]);
      }
    }));
});

function pathRequest(path: string): AnalyzeImageRequest {
  return {
    source: { type: 'path', path, origin: 'mcp' },
    mode: 'general',
    prompt: 'Describe',
    timeoutMs: 30000,
    maxOutputChars: 8000,
  };
}

function configFor(
  dir: string,
  overrides: Partial<Omit<PluginConfig, 'providers'>> & {
    providers?: Partial<PluginConfig['providers']>;
  } = {},
): PluginConfig {
  return {
    pluginRoot: dir,
    pluginDataDir: dir,
    providerOrder: overrides.providerOrder ?? ['ollama'],
    allowRemoteFallback: overrides.allowRemoteFallback ?? false,
    allowHttpUrls: overrides.allowHttpUrls ?? false,
    allowPrivateNetworkUrls: overrides.allowPrivateNetworkUrls ?? false,
    allowedDirectories: overrides.allowedDirectories ?? [dir],
    deniedDirectories: overrides.deniedDirectories ?? [],
    maxImageBytes: overrides.maxImageBytes ?? 1024 * 1024,
    hookTimeoutMs: overrides.hookTimeoutMs ?? 30000,
    providerTimeoutMs: overrides.providerTimeoutMs ?? 1000,
    mcpTimeoutMs: overrides.mcpTimeoutMs ?? 60000,
    maxOutputChars: overrides.maxOutputChars ?? 8000,
    providers: {
      ollama: { id: 'ollama', baseUrl: '', model: '', enabled: false, remote: false },
      omlx: { id: 'omlx', baseUrl: '', model: '', enabled: false, remote: false },
      llama_cpp: { id: 'llama_cpp', baseUrl: '', model: '', enabled: false, remote: false },
      remote_openai: { id: 'remote_openai', baseUrl: '', model: '', enabled: false, remote: true },
      ...overrides.providers,
    },
  };
}

async function withAsyncTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tempRoot = resolve(process.cwd(), '.test-tmp');
  mkdirSync(tempRoot, { recursive: true });
  const dir = mkdtempSync(join(tempRoot, 'cvb-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
