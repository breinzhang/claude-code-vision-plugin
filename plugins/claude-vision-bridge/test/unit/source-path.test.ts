import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeBase64Image } from '../../src/sources/base64-source.js';
import { detectImageMime } from '../../src/sources/mime.js';
import { resolvePathImage } from '../../src/sources/path-source.js';
import { tinyBmp, tinyGif, tinyJpeg, tinyPng, tinySvg, tinyWebp } from '../fixtures/images.js';
import { withTempDir } from '../helpers/temp.js';

describe('path and base64 image sources', () => {
  it.each([
    ['PNG', tinyPng, { mime: 'image/png', ext: '.png' }],
    ['JPEG', tinyJpeg, { mime: 'image/jpeg', ext: '.jpg' }],
    ['WebP', tinyWebp, { mime: 'image/webp', ext: '.webp' }],
    ['GIF', tinyGif, { mime: 'image/gif', ext: '.gif' }],
    ['BMP', tinyBmp, { mime: 'image/bmp', ext: '.bmp' }],
    ['SVG', tinySvg, { mime: 'image/svg+xml', ext: '.svg' }],
  ])('detects %s MIME from bytes', (_name, bytes, expected) => {
    expect(detectImageMime(bytes)).toEqual(expected);
  });

  it('resolves a local PNG path to bytes and hash', () =>
    withTempDir((dir) => {
      const file = join(dir, 'screen.png');
      writeFileSync(file, tinyPng);

      const resolved = resolvePathImage(file, { maxImageBytes: 1024 * 1024 });
      expect(resolved.type).toBe('path');
      expect(resolved.originalRef).toBe(file);
      expect(resolved.mime).toBe('image/png');
      expect(resolved.bytes.equals(tinyPng)).toBe(true);
      expect(resolved.sha256).toMatch(/^[a-f0-9]{64}$/);
    }));

  it('rejects MIME mismatch between extension and bytes', () =>
    withTempDir((dir) => {
      const file = join(dir, 'screen.jpg');
      writeFileSync(file, tinyPng);

      expect(() => resolvePathImage(file, { maxImageBytes: 1024 * 1024 })).toThrow(/MIME mismatch/);
    }));

  it('decodes MCP base64 image input', () => {
    const decoded = decodeBase64Image({
      mime: 'image/png',
      data: tinyPng.toString('base64'),
      maxImageBytes: 1024 * 1024,
    });

    expect(decoded.type).toBe('base64');
    expect(decoded.mime).toBe('image/png');
    expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects MIME mismatch between declared base64 MIME and bytes', () => {
    expect(() =>
      decodeBase64Image({
        mime: 'image/jpeg',
        data: tinyPng.toString('base64'),
        maxImageBytes: 1024 * 1024,
      }),
    ).toThrow(/MIME mismatch/);
  });
});
