import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveClipboardImage } from '../../src/sources/clipboard-source.js';
import { tinyPng } from '../fixtures/images.js';

describe('clipboard image source', () => {
  it('returns clipboard bytes from an injected reader and writes capture file', async () =>
    await withAsyncTempDir(async (dir) => {
      const image = await resolveClipboardImage({
        pluginDataDir: dir,
        maxImageBytes: 1024 * 1024,
        reader: {
          readImageBytes: async () => tinyPng,
        },
      });

      expect(image.type).toBe('clipboard');
      expect(image.mime).toBe('image/png');
      expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(image.resolvedPath).toBe(join(dir, 'captures', `${image.sha256}.png`));
      expect(existsSync(image.resolvedPath!)).toBe(true);
    }));

  it('throws CLIPBOARD_EMPTY style error when clipboard has no image', async () =>
    await withAsyncTempDir(async (dir) => {
      await expect(
        resolveClipboardImage({
          pluginDataDir: dir,
          maxImageBytes: 1024 * 1024,
          reader: {
            readImageBytes: async () => null,
          },
        }),
      ).rejects.toThrow(/Clipboard is empty/);
    }));
});

async function withAsyncTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tempRoot = resolve(process.cwd(), '.test-tmp');
  mkdirSync(tempRoot, { recursive: true });
  const dir = mkdtempSync(join(tempRoot, 'cvb-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
