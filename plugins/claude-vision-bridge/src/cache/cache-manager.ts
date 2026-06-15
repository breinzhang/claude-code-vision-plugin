import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { FailureArtifactSchema, VisionArtifactSchema } from '../core/schema.js';
import type { FailureArtifact, VisionArtifact } from '../core/types.js';

export class CacheManager {
  constructor(private readonly options: { dataDir: string }) {}

  ensureDirs(): void {
    for (const dir of ['success', 'failure', 'locks']) {
      mkdirSync(join(this.options.dataDir, 'cache', dir), { recursive: true });
    }
  }

  readSuccess(key: string): VisionArtifact | undefined {
    return readArtifact(join(this.options.dataDir, 'cache', 'success', `${key}.json`), VisionArtifactSchema);
  }

  writeSuccess(key: string, artifact: VisionArtifact): void {
    writeJsonAtomic(join(this.options.dataDir, 'cache', 'success', `${key}.json`), artifact);
    writeTextAtomic(join(this.options.dataDir, 'cache', 'success', `${key}.md`), artifact.markdown);
  }

  readFailure(key: string, ttlMs: number): FailureArtifact | undefined {
    const file = join(this.options.dataDir, 'cache', 'failure', `${key}.json`);
    if (ttlMs <= 0 || !existsSync(file)) return undefined;

    const ageMs = Date.now() - statSync(file).mtimeMs;
    if (ageMs > ttlMs) return undefined;

    return readArtifact(file, FailureArtifactSchema);
  }

  writeFailure(key: string, artifact: FailureArtifact): void {
    writeJsonAtomic(join(this.options.dataDir, 'cache', 'failure', `${key}.json`), artifact);
    writeTextAtomic(join(this.options.dataDir, 'cache', 'failure', `${key}.md`), artifact.markdown);
  }

  clear(kind: 'all' | 'success' | 'failure'): void {
    this.ensureDirs();
    const kinds = kind === 'all' ? ['success', 'failure'] : [kind];
    for (const item of kinds) {
      rmDirContents(join(this.options.dataDir, 'cache', item));
    }
  }
}

function readArtifact<T>(
  file: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): T | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const result = schema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function rmDirContents(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSyncSafe(dir)) {
    rmSyncSafe(join(dir, name));
  }
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function rmSyncSafe(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    return;
  }
}
