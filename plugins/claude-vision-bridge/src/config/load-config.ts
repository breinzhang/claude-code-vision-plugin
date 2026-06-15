import { PluginConfigSchema } from '../core/schema.js';
import type { PluginConfig, ProviderId } from '../core/types.js';

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function numEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PluginConfig {
  const providerOrder = splitCsv(env.CLAUDE_PLUGIN_OPTION_PROVIDER_ORDER);
  const parsedProviderOrder = providerOrder.length > 0 ? (providerOrder as ProviderId[]) : undefined;
  const allowRemoteFallback = boolEnv(env.CLAUDE_PLUGIN_OPTION_ALLOW_REMOTE_FALLBACK, false);

  return PluginConfigSchema.parse({
    pluginRoot: env.CLAUDE_PLUGIN_ROOT ?? process.cwd(),
    pluginDataDir: env.CLAUDE_VISION_PLUGIN_DATA ?? env.CLAUDE_PLUGIN_DATA ?? '.vision-data',
    providerOrder: parsedProviderOrder,
    allowRemoteFallback,
    allowHttpUrls: boolEnv(env.CLAUDE_PLUGIN_OPTION_ALLOW_HTTP_URLS, false),
    allowPrivateNetworkUrls: boolEnv(env.CLAUDE_PLUGIN_OPTION_ALLOW_PRIVATE_NETWORK_URLS, false),
    allowedDirectories: splitCsv(env.CLAUDE_PLUGIN_OPTION_ALLOWED_DIRECTORIES),
    deniedDirectories: splitCsv(env.CLAUDE_PLUGIN_OPTION_DENIED_DIRECTORIES),
    maxImageBytes: numEnv(env.CLAUDE_PLUGIN_OPTION_MAX_IMAGE_BYTES, 10485760),
    hookTimeoutMs: numEnv(env.CLAUDE_PLUGIN_OPTION_HOOK_TIMEOUT_MS, 30000),
    providerTimeoutMs: numEnv(env.CLAUDE_PLUGIN_OPTION_PROVIDER_TIMEOUT_MS, 20000),
    mcpTimeoutMs: numEnv(env.CLAUDE_PLUGIN_OPTION_MCP_TIMEOUT_MS, 60000),
    maxOutputChars: numEnv(env.CLAUDE_PLUGIN_OPTION_MAX_OUTPUT_CHARS, 8000),
    providers: {
      ollama: {
        id: 'ollama',
        baseUrl: env.CLAUDE_PLUGIN_OPTION_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1',
        model: env.CLAUDE_PLUGIN_OPTION_OLLAMA_MODEL ?? 'llava',
        enabled: true,
        remote: false,
      },
      omlx: {
        id: 'omlx',
        baseUrl: env.CLAUDE_PLUGIN_OPTION_OMLX_BASE_URL ?? 'http://127.0.0.1:8000/v1',
        model: env.CLAUDE_PLUGIN_OPTION_OMLX_MODEL ?? 'mlx-vlm',
        enabled: true,
        remote: false,
      },
      llama_cpp: {
        id: 'llama_cpp',
        baseUrl: env.CLAUDE_PLUGIN_OPTION_LLAMA_CPP_BASE_URL ?? 'http://127.0.0.1:8080/v1',
        model: env.CLAUDE_PLUGIN_OPTION_LLAMA_CPP_MODEL ?? 'llava',
        enabled: true,
        remote: false,
      },
      remote_openai: {
        id: 'remote_openai',
        baseUrl: env.CLAUDE_PLUGIN_OPTION_REMOTE_OPENAI_BASE_URL ?? '',
        model: env.CLAUDE_PLUGIN_OPTION_REMOTE_OPENAI_MODEL ?? '',
        apiKey: env.CLAUDE_PLUGIN_OPTION_REMOTE_OPENAI_API_KEY || undefined,
        enabled: allowRemoteFallback,
        remote: true,
      },
    },
  });
}
