import type { ProviderId } from '../core/types.js';

export interface ProviderAnalyzeRequest {
  image: {
    mime: string;
    bytes: Buffer;
  };
  prompt: string;
}

export interface ProviderAnalyzeResult {
  providerId: ProviderId;
  model: string;
  endpoint?: string;
  text: string;
}

export interface ProviderHealth {
  providerId: ProviderId;
  ok: boolean;
  message: string;
}

export interface VisionProvider {
  readonly id: ProviderId;
  readonly model: string;
  readonly baseUrl: string;
  healthCheck(): Promise<ProviderHealth>;
  analyze(request: ProviderAnalyzeRequest): Promise<ProviderAnalyzeResult>;
}

export type ProviderErrorCategory =
  | 'CONNECTION_REFUSED'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'HTTP_ERROR'
  | 'UNSUPPORTED_IMAGE';

export class ProviderError extends Error {
  constructor(
    public readonly category: ProviderErrorCategory,
    message: string,
  ) {
    super(`${category}: ${message}`);
    this.name = 'ProviderError';
  }
}
