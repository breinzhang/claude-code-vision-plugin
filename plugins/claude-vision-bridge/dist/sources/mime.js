import { extname } from 'node:path';
const extToMime = new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.webp', 'image/webp'],
    ['.gif', 'image/gif'],
    ['.bmp', 'image/bmp'],
    ['.svg', 'image/svg+xml'],
]);
export function supportedImageExtensions() {
    return [...extToMime.keys()];
}
export function mimeForExtension(path) {
    return extToMime.get(extname(path).toLowerCase());
}
export function detectImageMime(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { mime: 'image/png', ext: '.png' };
    }
    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        return { mime: 'image/jpeg', ext: '.jpg' };
    }
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
        return { mime: 'image/webp', ext: '.webp' };
    }
    if (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a') {
        return { mime: 'image/gif', ext: '.gif' };
    }
    if (bytes.subarray(0, 2).toString('ascii') === 'BM') {
        return { mime: 'image/bmp', ext: '.bmp' };
    }
    const head = bytes.subarray(0, Math.min(bytes.length, 512)).toString('utf8').trimStart().toLowerCase();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
        return { mime: 'image/svg+xml', ext: '.svg' };
    }
    throw new Error('Unsupported image MIME');
}
//# sourceMappingURL=mime.js.map