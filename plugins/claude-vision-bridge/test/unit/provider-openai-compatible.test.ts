import { describe, expect, it } from 'vitest';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { PluginConfig } from '../../src/core/types.js';
import { ProviderError } from '../../src/providers/base.js';
import { OpenAICompatibleVisionProvider } from '../../src/providers/openai-compatible.js';
import { buildProviders } from '../../src/providers/registry.js';
import { tinyPng } from '../fixtures/images.js';
import { startHttpServer } from '../helpers/http-server.js';

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: {
    model?: string;
    messages?: Array<{
      role?: string;
      content?: Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
      }>;
    }>;
  };
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function startChatServer(options: {
  status?: number;
  response?: unknown;
  delayMs?: number;
  capture?: (request: CapturedRequest) => void;
}) {
  return await startHttpServer((req, res) => {
    void (async () => {
      const rawBody = await readRequestBody(req);
      options.capture?.({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: rawBody.length > 0 ? JSON.parse(rawBody) : {},
      });

      if (options.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      res.statusCode = options.status ?? 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify(
          options.response ?? {
            choices: [{ message: { content: 'The screenshot shows a login error.' } }],
          },
        ),
      );
    })().catch((error: unknown) => {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : String(error));
    });
  });
}

function testConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  const config: PluginConfig = {
    pluginRoot: '/plugin',
    pluginDataDir: '/plugin-data',
    providerOrder: ['ollama', 'omlx', 'llama_cpp', 'remote_openai'],
    allowRemoteFallback: false,
    allowHttpUrls: false,
    allowPrivateNetworkUrls: false,
    allowedDirectories: [],
    deniedDirectories: [],
    maxImageBytes: 10485760,
    hookTimeoutMs: 30000,
    providerTimeoutMs: 5000,
    mcpTimeoutMs: 60000,
    maxOutputChars: 8000,
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
        baseUrl: 'https://vision.example/v1',
        model: 'gpt-4.1-mini',
        apiKey: 'secret',
        enabled: true,
        remote: true,
      },
    },
  };

  return {
    ...config,
    ...overrides,
    providers: {
      ...config.providers,
      ...overrides.providers,
    },
  };
}

describe('OpenAI-compatible vision provider', () => {
  it('posts text and a data URL image to chat completions and returns provider text', async () => {
    const requests: CapturedRequest[] = [];
    const server = await startChatServer({ capture: (request) => requests.push(request) });

    try {
      const provider = new OpenAICompatibleVisionProvider({
        id: 'ollama',
        baseUrl: `${server.url}/v1`,
        model: 'llava',
        timeoutMs: 5000,
      });
      const result = await provider.analyze({
        image: {
          mime: 'image/png',
          bytes: tinyPng,
        },
        prompt: 'Describe this image.',
      });

      expect(result.text).toContain('login error');
      expect(result.providerId).toBe('ollama');
      expect(result.model).toBe('llava');
      expect(result.endpoint).toBe(`${server.url}/v1`);
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('POST');
      expect(requests[0].url).toBe('/v1/chat/completions');
      expect(requests[0].body.model).toBe('llava');
      expect(requests[0].body.messages?.[0]?.content?.[0]).toEqual({
        type: 'text',
        text: 'Describe this image.',
      });
      expect(requests[0].body.messages?.[0]?.content?.[1]).toEqual({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${tinyPng.toString('base64')}`,
        },
      });
    } finally {
      await server.close();
    }
  });

  it('sends bearer authorization when an API key is configured', async () => {
    const requests: CapturedRequest[] = [];
    const server = await startChatServer({ capture: (request) => requests.push(request) });

    try {
      const provider = new OpenAICompatibleVisionProvider({
        id: 'remote_openai',
        baseUrl: `${server.url}/v1`,
        model: 'gpt-4.1-mini',
        apiKey: 'test-key',
        timeoutMs: 5000,
      });

      await provider.analyze({
        image: { mime: 'image/png', bytes: tinyPng },
        prompt: 'Describe this image.',
      });

      expect(requests[0].headers.authorization).toBe('Bearer test-key');
    } finally {
      await server.close();
    }
  });

  it('sends bearer authorization on provider health checks when an API key is configured', async () => {
    const requests: CapturedRequest[] = [];
    const server = await startChatServer({ capture: (request) => requests.push(request) });

    try {
      const provider = new OpenAICompatibleVisionProvider({
        id: 'omlx',
        baseUrl: `${server.url}/v1`,
        model: 'gemma-4-12B-it-4bit',
        apiKey: 'omlx-secret',
        timeoutMs: 5000,
      });

      const result = await provider.healthCheck();

      expect(result.ok).toBe(true);
      expect(requests[0].method).toBe('GET');
      expect(requests[0].url).toBe('/v1/models');
      expect(requests[0].headers.authorization).toBe('Bearer omlx-secret');
    } finally {
      await server.close();
    }
  });

  it.each([
    { choices: [] },
    { choices: [{ message: { content: '' } }] },
  ])('classifies malformed response %#', async (response) => {
    const server = await startChatServer({ response });

    try {
      const provider = new OpenAICompatibleVisionProvider({
        id: 'ollama',
        baseUrl: `${server.url}/v1`,
        model: 'llava',
        timeoutMs: 5000,
      });

      await expect(
        provider.analyze({
          image: { mime: 'image/png', bytes: tinyPng },
          prompt: 'Describe this image.',
        }),
      ).rejects.toMatchObject({ category: 'MALFORMED_RESPONSE' });
    } finally {
      await server.close();
    }
  });

  it('classifies non-2xx responses as HTTP errors', async () => {
    const server = await startChatServer({ status: 500, response: { error: 'boom' } });

    try {
      const provider = new OpenAICompatibleVisionProvider({
        id: 'ollama',
        baseUrl: `${server.url}/v1`,
        model: 'llava',
        timeoutMs: 5000,
      });

      await expect(
        provider.analyze({
          image: { mime: 'image/png', bytes: tinyPng },
          prompt: 'Describe this image.',
        }),
      ).rejects.toMatchObject({ category: 'HTTP_ERROR' });
    } finally {
      await server.close();
    }
  });

  it('classifies request timeouts', async () => {
    const server = await startChatServer({ delayMs: 100 });

    try {
      const provider = new OpenAICompatibleVisionProvider({
        id: 'ollama',
        baseUrl: `${server.url}/v1`,
        model: 'llava',
        timeoutMs: 10,
      });

      await expect(
        provider.analyze({
          image: { mime: 'image/png', bytes: tinyPng },
          prompt: 'Describe this image.',
        }),
      ).rejects.toMatchObject({ category: 'TIMEOUT' });
    } finally {
      await server.close();
    }
  });

  it('uses the OpenAI-compatible adapter for every configured provider', () => {
    const providers = buildProviders(testConfig({ allowRemoteFallback: true }));

    expect(providers.map((provider) => provider.id)).toEqual(['ollama', 'omlx', 'llama_cpp', 'remote_openai']);
    for (const provider of providers) {
      expect(provider).toBeInstanceOf(OpenAICompatibleVisionProvider);
    }
  });

  it('skips disabled providers and only enables remote providers when remote fallback is allowed', () => {
    const config = testConfig({
      providers: {
        omlx: {
          id: 'omlx',
          baseUrl: 'http://127.0.0.1:8000/v1',
          model: 'mlx-vlm',
          enabled: false,
          remote: false,
        },
      } as Partial<PluginConfig['providers']> as PluginConfig['providers'],
    });

    expect(buildProviders(config).map((provider) => provider.id)).toEqual(['ollama', 'llama_cpp']);
    expect(buildProviders({ ...config, allowRemoteFallback: true }).map((provider) => provider.id)).toEqual([
      'ollama',
      'llama_cpp',
      'remote_openai',
    ]);
  });

  it('exposes ProviderError categories in the error message', () => {
    expect(new ProviderError('MALFORMED_RESPONSE', 'missing content').message).toBe(
      'MALFORMED_RESPONSE: missing content',
    );
  });
});
