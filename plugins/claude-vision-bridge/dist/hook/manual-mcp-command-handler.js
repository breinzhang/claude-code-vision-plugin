import { readFileSync } from 'node:fs';
import { executeManualMcpCommand, } from '../command/manual-mcp-command.js';
import { loadConfig } from '../config/load-config.js';
const defaultDependencies = {
    loadPluginConfig: () => loadConfig(),
    executeCommand: (input) => executeManualMcpCommand(input),
};
export function buildManualMcpHookOutput(additionalContext) {
    return {
        hookSpecificOutput: {
            hookEventName: 'UserPromptExpansion',
            additionalContext,
        },
    };
}
export async function runManualMcpCommandHook(rawInput, dependencies = defaultDependencies) {
    try {
        const input = JSON.parse(rawInput);
        validateInput(input);
        const result = await dependencies.executeCommand({
            commandArgs: input.command_args ?? '',
            originalPrompt: input.prompt,
            cwd: input.cwd,
            config: dependencies.loadPluginConfig(),
        });
        return jsonLine(buildManualMcpHookOutput(`## Vision Bridge MCP Command Result\n\n${result}`));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonLine(buildManualMcpHookOutput(`## Vision Bridge MCP Command Failed\n\n${message}\n\nThe automatic image Hook was not run for this command.`));
    }
}
function validateInput(input) {
    if (input.hook_event_name !== 'UserPromptExpansion') {
        throw new Error('Expected a UserPromptExpansion Hook event.');
    }
    if (input.expansion_type !== 'slash_command') {
        throw new Error('Manual MCP command must be invoked as a slash command.');
    }
    if (input.command_name !== 'claude-vision-bridge:mcp') {
        throw new Error(`Unexpected command name: ${input.command_name}`);
    }
    if (input.command_source !== 'plugin') {
        throw new Error('Manual MCP command must come from the claude-vision-bridge plugin.');
    }
}
function jsonLine(value) {
    return `${JSON.stringify(value)}\n`;
}
async function main() {
    const rawInput = readFileSync(0, 'utf8');
    process.stdout.write(await runManualMcpCommandHook(rawInput));
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        process.stdout.write(jsonLine(buildManualMcpHookOutput(`## Vision Bridge MCP Command Failed\n\n${error instanceof Error ? error.message : String(error)}`)));
        process.exit(0);
    });
}
//# sourceMappingURL=manual-mcp-command-handler.js.map