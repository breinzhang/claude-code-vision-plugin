import type { ProviderId } from '../core/types.js';
import {
  ProviderError,
  type ProviderAnalyzeRequest,
  type ProviderAnalyzeResult,
  type ProviderHealth,
  type VisionProvider,
} from './base.js';

export class OpenAICompatibleVisionProvider implements VisionProvider {
  readonly id: ProviderId;
  readonly baseUrl: string;
  readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: { id: ProviderId; baseUrl: string; model: string; apiKey?: string; timeoutMs: number }) {
    this.id = options.id;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.baseUrl || !this.model) {
      return { providerId: this.id, ok: false, message: 'baseUrl or model is not configured' };
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.authorizationHeaders(),
      });
      return { providerId: this.id, ok: response.ok, message: response.ok ? 'ok' : `HTTP ${response.status}` };
    } catch (error) {
      return { providerId: this.id, ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async analyze(request: ProviderAnalyzeRequest): Promise<ProviderAnalyzeResult> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.authorizationHeaders(),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: this.buildPrompt(request.prompt) },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${request.image.mime};base64,${request.image.bytes.toString('base64')}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new ProviderError('HTTP_ERROR', `HTTP ${response.status}`);
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ProviderError('MALFORMED_RESPONSE', 'missing choices[0].message.content');
    }

    return {
      providerId: this.id,
      model: this.model,
      endpoint: this.baseUrl,
      text: content,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('TIMEOUT', `timeout after ${this.timeoutMs}ms`);
      }
      throw new ProviderError('CONNECTION_REFUSED', error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  private authorizationHeaders(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }

  private buildPrompt(userPrompt: string): string {
    return [
      'You are analyzing an attached image for Claude Code.',
      'The image bytes are already provided as the following image_url content part.',
      'Do not say you cannot access local files, URLs, clipboards, or the filesystem; analyze the attached image itself.',
      'If the user mentions a path, URL, or clipboard image, treat that text as a reference label only.',
      '',
      'User request:',
      userPrompt,
    ].join('\n');
  }
}
