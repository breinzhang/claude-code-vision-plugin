import { OpenAICompatibleVisionProvider } from './openai-compatible.js';
export function buildProviders(config) {
    return config.providerOrder
        .map((id) => buildProvider(config, id))
        .filter((provider) => provider !== undefined);
}
export function buildProvider(config, id) {
    const provider = config.providers[id];
    if (!provider.enabled)
        return undefined;
    if (provider.remote && !config.allowRemoteFallback)
        return undefined;
    return new OpenAICompatibleVisionProvider({
        id,
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKey: provider.apiKey,
        timeoutMs: config.providerTimeoutMs,
    });
}
//# sourceMappingURL=registry.js.map