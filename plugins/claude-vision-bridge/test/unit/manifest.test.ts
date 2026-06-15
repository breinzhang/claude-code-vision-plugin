import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
      hooks?: string;
      mcpServers?: string;
    };

    expect(plugin.name).toBe('claude-vision-bridge');
    expect(plugin.displayName).toBe('Claude Vision Bridge');
    expect(plugin.license).toBe('MIT');
    expect(plugin.defaultEnabled).toBe(false);
    expect(plugin).not.toHaveProperty('hooks');
    expect(plugin).not.toHaveProperty('mcpServers');
  });
});
