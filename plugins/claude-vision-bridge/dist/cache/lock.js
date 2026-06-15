import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
export function withFileLock(lockPath, fn) {
    mkdirSync(dirname(lockPath), { recursive: true });
    const fd = openSync(lockPath, 'w');
    try {
        return fn();
    }
    finally {
        closeSync(fd);
        rmSync(lockPath, { force: true });
    }
}
//# sourceMappingURL=lock.js.map