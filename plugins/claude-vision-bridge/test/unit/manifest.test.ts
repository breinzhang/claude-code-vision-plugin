import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

describe('plugin and marketplace manifests', () => {
  it('declares the marketplace catalog with the vision plugin', () => {
    const marketplace = readJson('../../.claude-plugin/marketplace.json') as {
      name: string;
      description: string;
      plugins: Array<{ name: string; source: string }>;
    };

    expect(marketplace.name).toBe('brein-claude-tools');
    expect(marketplace.description).toBe('Claude Code plugins maintained by brein.');
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({
        name: 'claude-vision-bridge',
        source: './plugins/claude-vision-bridge',
      }),
    );
  });

  it('declares plugin metadata and disabled-by-default behavior', () => {
    const plugin = readJson('.claude-plugin/plugin.json') as {
      name: string;
      displayName: string;
      license: string;
      defaultEnabled: boolean;
      userConfig: Record<string, { sensitive?: boolean }>;
      hooks?: string;
      mcpServers?: string;
    };

    expect(plugin.name).toBe('claude-vision-bridge');
    expect(plugin.displayName).toBe('Claude Vision Bridge');
    expect(plugin.license).toBe('MIT');
    expect(plugin.defaultEnabled).toBe(false);
    expect(plugin.userConfig.omlx_api_key).toMatchObject({ sensitive: true });
    expect(plugin).not.toHaveProperty('hooks');
    expect(plugin).not.toHaveProperty('mcpServers');
  });

  it('packages a manual-only MCP skill without a main-session MCP server', () => {
    expect(existsSync(resolve('.mcp.json'))).toBe(false);

    const skill = readFileSync(resolve('skills/mcp/SKILL.md'), 'utf8');
    expect(skill).toContain('disable-model-invocation: true');

    const hooks = readJson('hooks/hooks.json') as {
      hooks: {
        UserPromptSubmit: unknown[];
        UserPromptExpansion: Array<{
          matcher: string;
          hooks: Array<{ args: string[] }>;
        }>;
      };
    };

    expect(hooks.hooks.UserPromptSubmit).toHaveLength(1);
    expect(hooks.hooks.UserPromptExpansion[0].matcher).toBe('claude-vision-bridge:mcp');
    expect(hooks.hooks.UserPromptExpansion[0].hooks[0].args).toContain(
      '${CLAUDE_PLUGIN_ROOT}/dist/manual-mcp-command-handler.js',
    );
  });

  it('declares configurable manual MCP aliases', () => {
    const plugin = readJson('.claude-plugin/plugin.json') as {
      userConfig: Record<string, { default?: string }>;
    };

    expect(plugin.userConfig.mcp_analyze_command.default).toBe('analyze');
    expect(plugin.userConfig.mcp_doctor_command.default).toBe('doctor');
    expect(plugin.userConfig.mcp_clean_command.default).toBe('clean');
    expect(plugin.userConfig.mcp_tools_command.default).toBe('tools');
  });
});
