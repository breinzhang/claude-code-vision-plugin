import { readFileSync } from 'node:fs';
import {
  executeManualMcpCommand,
  type ManualMcpExecutionInput,
} from '../command/manual-mcp-command.js';
import { loadConfig } from '../config/load-config.js';
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

const defaultDependencies: ManualMcpHookDependencies = {
  loadPluginConfig: () => loadConfig(),
  executeCommand: (input) => executeManualMcpCommand(input),
};

export function buildManualMcpHookOutput(additionalContext: string): {
  hookSpecificOutput: {
    hookEventName: 'UserPromptExpansion';
    additionalContext: string;
  };
} {
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptExpansion',
      additionalContext,
    },
  };
}

export async function runManualMcpCommandHook(
  rawInput: string,
  dependencies: ManualMcpHookDependencies = defaultDependencies,
): Promise<string> {
  try {
    const input = JSON.parse(rawInput) as UserPromptExpansionInput;
    validateInput(input);

    const result = await dependencies.executeCommand({
      commandArgs: input.command_args ?? '',
      originalPrompt: input.prompt,
      cwd: input.cwd,
      config: dependencies.loadPluginConfig(),
    });
    return jsonLine(
      buildManualMcpHookOutput(`## Vision Bridge MCP Command Result\n\n${result}`),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonLine(
      buildManualMcpHookOutput(
        `## Vision Bridge MCP Command Failed\n\n${message}\n\nThe automatic image Hook was not run for this command.`,
      ),
    );
  }
}

function validateInput(input: UserPromptExpansionInput): void {
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

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

async function main(): Promise<void> {
  const rawInput = readFileSync(0, 'utf8');
  process.stdout.write(await runManualMcpCommandHook(rawInput));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stdout.write(
      jsonLine(
        buildManualMcpHookOutput(
          `## Vision Bridge MCP Command Failed\n\n${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      ),
    );
    process.exit(0);
  });
}
