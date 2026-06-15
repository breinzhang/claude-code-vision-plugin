import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256Hex } from '../cache/hash.js';
import type { ResolvedImageSource } from '../core/types.js';
import { detectImageMime } from './mime.js';

export interface ClipboardReader {
  readImageBytes(): Promise<Buffer | null>;
}

export interface ClipboardOptions {
  pluginDataDir: string;
  maxImageBytes: number;
  reader?: ClipboardReader;
}

export async function resolveClipboardImage(options: ClipboardOptions): Promise<ResolvedImageSource> {
  const reader = options.reader ?? new SystemClipboardReader();
  const bytes = await reader.readImageBytes();
  if (!bytes || bytes.length === 0) {
    throw new Error('Clipboard is empty or does not contain an image');
  }
  if (bytes.length > options.maxImageBytes) {
    throw new Error(`Image exceeds max size: ${bytes.length}`);
  }

  const detected = detectImageMime(bytes);
  const sha256 = sha256Hex(bytes);
  const captureDir = join(options.pluginDataDir, 'captures');
  mkdirSync(captureDir, { recursive: true });
  const resolvedPath = join(captureDir, `${sha256}${detected.ext}`);
  writeFileSync(resolvedPath, bytes, { flag: 'w' });

  return {
    type: 'clipboard',
    originalRef: 'clipboard',
    resolvedPath,
    bytes,
    sha256,
    mime: detected.mime,
    ext: detected.ext,
  };
}

class SystemClipboardReader implements ClipboardReader {
  async readImageBytes(): Promise<Buffer | null> {
    if (process.platform !== 'darwin') {
      throw new Error(`Clipboard image reading is not available on ${process.platform}`);
    }

    const out = join(tmpdir(), `claude-vision-clipboard-${process.pid}-${Date.now()}.png`);
    const script = [
      'set outFile to missing value',
      'try',
      'set imageData to the clipboard as «class PNGf»',
      `set outFile to open for access POSIX file ${appleScriptString(out)} with write permission`,
      'set eof outFile to 0',
      'write imageData to outFile',
      'close access outFile',
      'on error errMsg number errNum',
      'try',
      'if outFile is not missing value then close access outFile',
      'end try',
      'error errMsg number errNum',
      'end try',
    ].join('\n');

    const result = spawnSync('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      if (result.status !== 0 || !existsSync(out)) {
        return null;
      }
      const bytes = readFileSync(out);
      return bytes.length === 0 ? null : bytes;
    } finally {
      rmSync(out, { force: true });
    }
  }
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
