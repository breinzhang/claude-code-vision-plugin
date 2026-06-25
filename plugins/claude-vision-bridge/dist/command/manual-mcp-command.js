import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, } from '@modelcontextprotocol/sdk/types.js';
import { inferVisionMode } from '../core/infer-vision-mode.js';
import { createMcpServer } from '../mcp/server.js';
import { extractSourcesFromPrompt } from '../sources/extract-from-prompt.js';
const defaultImagePrompt = 'Describe the image for a coding agent.';
export async function executeManualMcpCommand(input, dependencies = { createSession: createInMemorySession }) {
    const session = await dependencies.createSession();
    try {
        const listed = await session.listTools();
        const parsed = parseManualMcpCommand({
            commandArgs: input.commandArgs,
            originalPrompt: input.originalPrompt,
            config: input.config,
            availableToolNames: listed.tools.map((tool) => tool.name),
        });
        if (parsed.kind === 'list-tools')
            return renderToolList(listed.tools);
        const result = await session.callTool({
            name: parsed.toolName,
            arguments: parsed.arguments,
        });
        return renderToolResult(parsed.toolName, result);
    }
    finally {
        await session.close();
    }
}
export function parseManualMcpCommand(input) {
    const { token, remainder } = splitFirstToken(input.commandArgs);
    if (!token)
        throw new Error(manualMcpUsage(input.config));
    if (input.availableToolNames.includes(token)) {
        return parseExactTool(token, remainder, input);
    }
    if (token === input.config.mcpToolsCommand) {
        requireNoArguments(remainder, token);
        return { kind: 'list-tools' };
    }
    if (token === input.config.mcpAnalyzeCommand) {
        requireAvailableTool('analyze_image', input.availableToolNames);
        return parseAnalyze(remainder, input);
    }
    if (token === input.config.mcpDoctorCommand) {
        requireAvailableTool('doctor_providers', input.availableToolNames);
        requireNoArguments(remainder, token);
        return { kind: 'call-tool', toolName: 'doctor_providers', arguments: {} };
    }
    if (token === input.config.mcpCleanCommand) {
        requireAvailableTool('clear_vision_cache', input.availableToolNames);
        return {
            kind: 'call-tool',
            toolName: 'clear_vision_cache',
            arguments: { kind: parseCacheKind(remainder) },
        };
    }
    throw new Error(`Unknown Vision Bridge MCP tool or alias: ${token}`);
}
function parseExactTool(toolName, remainder, input) {
    if (toolName === 'analyze_image')
        return parseAnalyze(remainder, input);
    if (toolName === 'doctor_providers') {
        requireNoArguments(remainder, toolName);
        return { kind: 'call-tool', toolName, arguments: {} };
    }
    if (toolName === 'clear_vision_cache') {
        return {
            kind: 'call-tool',
            toolName,
            arguments: { kind: parseCacheKind(remainder) },
        };
    }
    return {
        kind: 'call-tool',
        toolName,
        arguments: parseJsonArguments(remainder),
    };
}
function parseAnalyze(remainder, input) {
    let sources = extractSourcesFromPrompt(remainder);
    if (sources.length === 0) {
        sources = extractSourcesFromPrompt(input.originalPrompt);
    }
    if (sources.length === 0) {
        throw new Error('Manual analyze requires one image source: a pasted image, image path, or image URL.');
    }
    if (sources.length !== 1) {
        throw new Error('Manual analyze requires exactly one image source.');
    }
    const source = sources[0];
    const question = stripSourceFromQuestion(remainder, source);
    const prompt = question || defaultImagePrompt;
    return {
        kind: 'call-tool',
        toolName: 'analyze_image',
        arguments: {
            source: toMcpToolSource(source),
            mode: inferVisionMode(prompt),
            prompt,
        },
    };
}
function splitFirstToken(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return { token: '', remainder: '' };
    const whitespaceIndex = trimmed.search(/\s/);
    if (whitespaceIndex === -1)
        return { token: trimmed, remainder: '' };
    return {
        token: trimmed.slice(0, whitespaceIndex),
        remainder: trimmed.slice(whitespaceIndex).trim(),
    };
}
function parseCacheKind(value) {
    const kind = value.trim() || 'all';
    if (kind === 'all' || kind === 'success' || kind === 'failure')
        return kind;
    throw new Error('Cache kind must be all, success, or failure.');
}
function parseJsonArguments(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return {};
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        throw new Error('Future MCP tool arguments must be valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Future MCP tool arguments must be one JSON object.');
    }
    return parsed;
}
function requireNoArguments(value, command) {
    if (value.trim())
        throw new Error(`${command} does not accept arguments.`);
}
function requireAvailableTool(toolName, availableToolNames) {
    if (!availableToolNames.includes(toolName)) {
        throw new Error(`Vision Bridge MCP tool is unavailable: ${toolName}`);
    }
}
function stripSourceFromQuestion(value, source) {
    let question = value;
    if (source.type === 'clipboard') {
        question = question.replace(/\[Image\s+#\d+\]/gi, ' ');
    }
    else if (source.type === 'url') {
        question = question.replaceAll(source.url, ' ');
    }
    else if (source.type === 'path') {
        for (const reference of [`"${source.path}"`, `'${source.path}'`, `\`${source.path}\``, source.path]) {
            question = question.replaceAll(reference, ' ');
        }
    }
    return question.replace(/\s+/g, ' ').trim();
}
function toMcpToolSource(source) {
    if (source.type === 'clipboard')
        return { type: 'clipboard' };
    if (source.type === 'url')
        return { type: 'url', url: source.url };
    if (source.type === 'path')
        return { type: 'path', path: source.path };
    return { type: 'base64', mime: source.mime, data: source.data };
}
function manualMcpUsage(config) {
    return [
        'Usage: /claude-vision-bridge:mcp <subcommand> [arguments]',
        `Subcommands: ${config.mcpAnalyzeCommand}, ${config.mcpDoctorCommand}, ${config.mcpCleanCommand}, ${config.mcpToolsCommand}`,
        'Exact tools: analyze_image, doctor_providers, clear_vision_cache',
    ].join('\n');
}
async function createInMemorySession() {
    const server = await createMcpServer();
    const client = new Client({ name: 'vision-bridge-manual-command', version: '0.1.6' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
    }
    catch (error) {
        await Promise.allSettled([client.close(), server.close()]);
        throw error;
    }
    return {
        listTools: () => client.listTools(),
        callTool: async ({ name, arguments: args }) => {
            const result = await client.callTool({ name, arguments: args });
            return CallToolResultSchema.parse(result);
        },
        close: async () => {
            await Promise.allSettled([client.close(), server.close()]);
        },
    };
}
function renderToolList(tools) {
    const lines = tools.map((tool) => tool.description ? `- \`${tool.name}\`: ${tool.description}` : `- \`${tool.name}\``);
    return ['## Vision Bridge MCP Tools', '', ...lines].join('\n');
}
function renderToolResult(toolName, result) {
    const textBlocks = result.content
        .filter((block) => {
        return block.type === 'text';
    })
        .map((block) => block.text);
    const body = textBlocks.length > 0
        ? textBlocks.join('\n\n')
        : result.structuredContent
            ? JSON.stringify(result.structuredContent, null, 2)
            : '(Tool completed without text output.)';
    return [`## Vision Bridge MCP Tool: ${toolName}`, '', body].join('\n');
}
//# sourceMappingURL=manual-mcp-command.js.map