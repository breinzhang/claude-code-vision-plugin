import type { PluginConfig, ProviderId } from '../core/types.js';
import type { VisionProvider } from './base.js';
import { OpenAICompatibleVisionProvider } from './openai-compatible.js';

export function buildProviders(config: PluginConfig): VisionProvider[] {
  return config.providerOrder
    .map((id) => buildProvider(config, id))
    .filter((provider): provider is VisionProvider => provider !== undefined);
}

export function buildProvider(config: PluginConfig, id: ProviderId): VisionProvider | undefined {
  const provider = config.providers[id];
  if (!provider.enabled) return undefined;
  if (provider.remote && !config.allowRemoteFallback) return undefined;

  return new OpenAICompatibleVisionProvider({
    id,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: provider.apiKey,
    timeoutMs: config.providerTimeoutMs,
  });
}
