import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { sha256Hex } from '../cache/hash.js';
import { detectImageMime, mimeForExtension } from './mime.js';
export function resolvePathImage(path, options) {
    const resolvedPath = realpathSync(path);
    const stat = statSync(resolvedPath);
    if (!stat.isFile()) {
        throw new Error('Path is not a file');
    }
    if (stat.size > options.maxImageBytes) {
        throw new Error(`Image exceeds max size: ${stat.size}`);
    }
    const expectedMime = mimeForExtension(resolvedPath);
    if (!expectedMime) {
        throw new Error(`Unsupported image extension: ${extname(resolvedPath)}`);
    }
    const bytes = readFileSync(resolvedPath);
    const detected = detectImageMime(bytes);
    if (detected.mime !== expectedMime) {
        throw new Error(`MIME mismatch: extension=${expectedMime} bytes=${detected.mime}`);
    }
    return {
        type: 'path',
        originalRef: path,
        resolvedPath,
        bytes,
        sha256: sha256Hex(bytes),
        mime: detected.mime,
        ext: detected.ext,
    };
}
//# sourceMappingURL=path-source.js.map