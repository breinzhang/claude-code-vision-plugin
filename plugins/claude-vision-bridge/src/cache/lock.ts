import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export function withFileLock<T>(lockPath: string, fn: () => T): T {
  mkdirSync(dirname(lockPath), { recursive: true });
  const fd = openSync(lockPath, 'w');
  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}
