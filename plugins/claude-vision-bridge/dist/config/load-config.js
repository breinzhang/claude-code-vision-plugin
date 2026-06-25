import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PluginConfigSchema } from '../core/schema.js';
const pluginConfigKey = 'claude-vision-bridge@brein-claude-tools';
function splitCsv(value) {
    return (configuredValue(value) ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}
function normalizeProviderOrder(value) {
    return splitCsv(value).map((item) => item.toLowerCase().replace(/-/g, '_'));
}
function boolEnv(value, fallback) {
    const configured = configuredValue(value);
    if (configured === undefined)
        return fallback;
    return configured === '1' || configured.toLowerCase() === 'true';
}
function numEnv(value, fallback) {
    const parsed = Number(configuredValue(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function configuredValue(value) {
    if (value === undefined || value === '')
        return undefined;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (typeof value !== 'string')
        return undefined;
    if (/^\$\{[A-Z0-9_]+\}$/.test(value))
        return undefined;
    return value;
}
export function loadConfig(env = process.env) {
    const settingsOptions = readClaudeSettingsPluginOptions(env);
    const providerOrder = normalizeProviderOrder(pluginOption(env, settingsOptions, 'provider_order'));
    const parsedProviderOrder = providerOrder.length > 0 ? providerOrder : undefined;
    const allowRemoteFallback = boolEnv(pluginOption(env, settingsOptions, 'allow_remote_fallback'), false);
    return PluginConfigSchema.parse({
        pluginRoot: configuredValue(env.CLAUDE_PLUGIN_ROOT) ?? process.cwd(),
        pluginDataDir: configuredValue(env.CLAUDE_VISION_PLUGIN_DATA) ?? configuredValue(env.CLAUDE_PLUGIN_DATA) ?? '.vision-data',
        providerOrder: parsedProviderOrder,
        allowRemoteFallback,
        allowHttpUrls: boolEnv(pluginOption(env, settingsOptions, 'allow_http_urls'), false),
        allowPrivateNetworkUrls: boolEnv(pluginOption(env, settingsOptions, 'allow_private_network_urls'), false),
        allowedDirectories: splitCsv(pluginOption(env, settingsOptions, 'allowed_directories')),
        deniedDirectories: splitCsv(pluginOption(env, settingsOptions, 'denied_directories')),
        maxImageBytes: numEnv(pluginOption(env, settingsOptions, 'max_image_bytes'), 10485760),
        hookTimeoutMs: numEnv(pluginOption(env, settingsOptions, 'hook_timeout_ms'), 30000),
        providerTimeoutMs: numEnv(pluginOption(env, settingsOptions, 'provider_timeout_ms'), 20000),
        mcpTimeoutMs: numEnv(pluginOption(env, settingsOptions, 'mcp_timeout_ms'), 60000),
        maxOutputChars: numEnv(pluginOption(env, settingsOptions, 'max_output_chars'), 8000),
        mcpAnalyzeCommand: configuredValue(pluginOption(env, settingsOptions, 'mcp_analyze_command')) ?? 'analyze',
        mcpDoctorCommand: configuredValue(pluginOption(env, settingsOptions, 'mcp_doctor_command')) ?? 'doctor',
        mcpCleanCommand: configuredValue(pluginOption(env, settingsOptions, 'mcp_clean_command')) ?? 'clean',
        mcpToolsCommand: configuredValue(pluginOption(env, settingsOptions, 'mcp_tools_command')) ?? 'tools',
        providers: {
            ollama: {
                id: 'ollama',
                baseUrl: configuredValue(pluginOption(env, settingsOptions, 'ollama_base_url')) ?? 'http://127.0.0.1:11434/v1',
                model: configuredValue(pluginOption(env, settingsOptions, 'ollama_model')) ?? 'llava',
                apiKey: configuredValue(pluginOption(env, settingsOptions, 'ollama_api_key')),
                enabled: true,
                remote: false,
            },
            omlx: {
                id: 'omlx',
                baseUrl: configuredValue(pluginOption(env, settingsOptions, 'omlx_base_url')) ?? 'http://127.0.0.1:8000/v1',
                model: configuredValue(pluginOption(env, settingsOptions, 'omlx_model')) ?? 'mlx-vlm',
                apiKey: configuredValue(pluginOption(env, settingsOptions, 'omlx_api_key')),
                enabled: true,
                remote: false,
            },
            llama_cpp: {
                id: 'llama_cpp',
                baseUrl: configuredValue(pluginOption(env, settingsOptions, 'llama_cpp_base_url')) ?? 'http://127.0.0.1:8080/v1',
                model: configuredValue(pluginOption(env, settingsOptions, 'llama_cpp_model')) ?? 'llava',
                apiKey: configuredValue(pluginOption(env, settingsOptions, 'llama_cpp_api_key')),
                enabled: true,
                remote: false,
            },
            remote_openai: {
                id: 'remote_openai',
                baseUrl: configuredValue(pluginOption(env, settingsOptions, 'remote_openai_base_url')) ?? '',
                model: configuredValue(pluginOption(env, settingsOptions, 'remote_openai_model')) ?? '',
                apiKey: configuredValue(pluginOption(env, settingsOptions, 'remote_openai_api_key')),
                enabled: allowRemoteFallback,
                remote: true,
            },
        },
    });
}
function pluginOption(env, settingsOptions, optionName) {
    const envName = `CLAUDE_PLUGIN_OPTION_${optionName.toUpperCase()}`;
    return configuredValue(env[envName]) ?? settingsOptions[optionName];
}
function readClaudeSettingsPluginOptions(env) {
    try {
        const home = configuredValue(env.HOME) ?? homedir();
        const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
        const configs = settings.pluginConfigs ?? {};
        return configs[pluginConfigKey]?.options ?? findVisionBridgeOptions(configs) ?? {};
    }
    catch {
        return {};
    }
}
function findVisionBridgeOptions(configs) {
    for (const [key, value] of Object.entries(configs)) {
        if (key.startsWith('claude-vision-bridge@') && value.options)
            return value.options;
    }
    return undefined;
}
//# sourceMappingURL=load-config.js.map