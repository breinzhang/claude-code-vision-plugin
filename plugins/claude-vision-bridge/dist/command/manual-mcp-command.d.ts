import { type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { PluginConfig } from '../core/types.js';
export type ParsedManualMcpCommand = {
    kind: 'list-tools';
} | {
    kind: 'call-tool';
    toolName: string;
    arguments: Record<string, unknown>;
};
export interface ManualMcpSession {
    listTools(): Promise<{
        tools: Tool[];
    }>;
    callTool(input: {
        name: string;
        arguments: Record<string, unknown>;
    }): Promise<CallToolResult>;
    close(): Promise<void>;
}
export interface ManualMcpDependencies {
    createSession(): Promise<ManualMcpSession>;
}
export interface ManualMcpExecutionInput {
    commandArgs: string;
    originalPrompt: string;
    cwd: string;
    config: PluginConfig;
}
export declare function executeManualMcpCommand(input: ManualMcpExecutionInput, dependencies?: ManualMcpDependencies): Promise<string>;
export declare function parseManualMcpCommand(input: {
    commandArgs: string;
    originalPrompt: string;
    config: PluginConfig;
    availableToolNames: string[];
}): ParsedManualMcpCommand;
