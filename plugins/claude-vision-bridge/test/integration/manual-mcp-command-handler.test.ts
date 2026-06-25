import { describe, expect, it, vi } from 'vitest';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { PluginConfigSchema } from '../../src/core/schema.js';
import {
  executeManualMcpCommand,
  type ManualMcpDependencies,
  type ManualMcpSession,
} from '../../src/command/manual-mcp-command.js';
import { runManualMcpCommandHook } from '../../src/hook/manual-mcp-command-handler.js';

describe('manual MCP command execution', () => {
  it('lists tools without calling a tool', async () => {
    const session = fakeSession({
      tools: [
        {
          name: 'analyze_image',
          description: 'Analyze image',
          inputSchema: { type: 'object' },
        },
      ],
    });

    const output = await executeManualMcpCommand(commandInput('tools'), session.dependencies);

    expect(output).toContain('analyze_image');
    expect(session.listTools).toHaveBeenCalledTimes(1);
    expect(session.callTool).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('calls one resolved tool and closes after success', async () => {
    const session = fakeSession({
      tools: [
        {
          name: 'doctor_providers',
          description: 'Doctor',
          inputSchema: { type: 'object' },
        },
      ],
      callResult: {
        content: [{ type: 'text', text: '{"providerOrder":["omlx"]}' }],
      },
    });

    const output = await executeManualMcpCommand(commandInput('doctor'), session.dependencies);

    expect(session.callTool).toHaveBeenCalledWith({
      name: 'doctor_providers',
      arguments: {},
    });
    expect(output).toContain('providerOrder');
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('closes the temporary session after a tool failure', async () => {
    const session = fakeSession({
      tools: [
        {
          name: 'doctor_providers',
          description: 'Doctor',
          inputSchema: { type: 'object' },
        },
      ],
      callError: new Error('tool failed'),
    });

    await expect(
      executeManualMcpCommand(commandInput('doctor'), session.dependencies),
    ).rejects.toThrow('tool failed');
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('renders UserPromptExpansion additionalContext', async () => {
    const executeCommand = vi.fn().mockResolvedValue('## Vision Bridge MCP Tool: doctor_providers');
    const output = await runManualMcpCommandHook(
      JSON.stringify({
        session_id: 's',
        cwd: '/work',
        hook_event_name: 'UserPromptExpansion',
        expansion_type: 'slash_command',
        command_name: 'claude-vision-bridge:mcp',
        command_args: 'doctor',
        command_source: 'plugin',
        prompt: '/claude-vision-bridge:mcp doctor',
      }),
      {
        loadPluginConfig: () => PluginConfigSchema.parse({}),
        executeCommand,
      },
    );

    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptExpansion');
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      '## Vision Bridge MCP Command Result',
    );
    expect(executeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: 'doctor',
        originalPrompt: '/claude-vision-bridge:mcp doctor',
        cwd: '/work',
      }),
    );
  });

  it('returns visible failure context for invalid command input', async () => {
    const output = await runManualMcpCommandHook(
      JSON.stringify({
        session_id: 's',
        cwd: '/work',
        hook_event_name: 'UserPromptExpansion',
        expansion_type: 'mcp_prompt',
        command_name: 'claude-vision-bridge:mcp',
        command_args: 'doctor',
        command_source: 'plugin',
        prompt: '/claude-vision-bridge:mcp doctor',
      }),
    );

    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      '## Vision Bridge MCP Command Failed',
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain('slash command');
  });
});

function commandInput(commandArgs: string) {
  return {
    commandArgs,
    originalPrompt: `/claude-vision-bridge:mcp ${commandArgs}`,
    cwd: '/work',
    config: PluginConfigSchema.parse({}),
  };
}

function fakeSession(input: {
  tools: Tool[];
  callResult?: CallToolResult;
  callError?: Error;
}): {
  dependencies: ManualMcpDependencies;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const listTools = vi.fn().mockResolvedValue({ tools: input.tools });
  const callTool = input.callError
    ? vi.fn().mockRejectedValue(input.callError)
    : vi.fn().mockResolvedValue(input.callResult ?? { content: [] });
  const close = vi.fn().mockResolvedValue(undefined);
  const session: ManualMcpSession = { listTools, callTool, close };

  return {
    dependencies: { createSession: async () => session },
    listTools,
    callTool,
    close,
  };
}
