import { sha256Hex } from '../cache/hash.js';
import { detectImageMime } from './mime.js';
export function decodeBase64Image(input) {
    let bytes;
    try {
        bytes = Buffer.from(input.data, 'base64');
    }
    catch {
        throw new Error('Invalid base64 image data');
    }
    if (bytes.length === 0) {
        throw new Error('Invalid base64 image data');
    }
    if (bytes.length > input.maxImageBytes) {
        throw new Error(`Image exceeds max size: ${bytes.length}`);
    }
    const detected = detectImageMime(bytes);
    if (detected.mime !== input.mime) {
        throw new Error(`MIME mismatch: declared=${input.mime} bytes=${detected.mime}`);
    }
    const sha256 = sha256Hex(bytes);
    return {
        type: 'base64',
        originalRef: `base64:${input.mime}:${sha256}`,
        bytes,
        sha256,
        mime: detected.mime,
        ext: detected.ext,
    };
}
//# sourceMappingURL=base64-source.js.map