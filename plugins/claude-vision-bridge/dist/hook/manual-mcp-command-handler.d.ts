import { type ManualMcpExecutionInput } from '../command/manual-mcp-command.js';
import type { PluginConfig } from '../core/types.js';
export interface UserPromptExpansionInput {
    session_id: string;
    cwd: string;
    hook_event_name: 'UserPromptExpansion';
    expansion_type: 'slash_command' | 'mcp_prompt';
    command_name: string;
    command_args: string;
    command_source: string;
    prompt: string;
}
export interface ManualMcpHookDependencies {
    loadPluginConfig(): PluginConfig;
    executeCommand(input: ManualMcpExecutionInput): Promise<string>;
}
export declare function buildManualMcpHookOutput(additionalContext: string): {
    hookSpecificOutput: {
        hookEventName: 'UserPromptExpansion';
        additionalContext: string;
    };
};
export declare function runManualMcpCommandHook(rawInput: string, dependencies?: ManualMcpHookDependencies): Promise<string>;
