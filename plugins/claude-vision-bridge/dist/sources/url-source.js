import { sha256Hex } from '../cache/hash.js';
import { assertUrlAllowed } from '../security/url-policy.js';
import { detectImageMime } from './mime.js';
export async function downloadUrlImage(urlText, options) {
    let url = new URL(urlText);
    let redirects = 0;
    while (true) {
        await assertUrlAllowed(url, options);
        const controller = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, options.timeoutMs);
        try {
            const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
            if (response.status >= 300 && response.status < 400) {
                if (redirects >= options.maxRedirects) {
                    throw new Error('Too many URL redirects');
                }
                const location = response.headers.get('location');
                if (!location) {
                    throw new Error('Redirect response missing location');
                }
                await response.body?.cancel();
                url = new URL(location, url);
                redirects += 1;
                continue;
            }
            if (!response.ok) {
                throw new Error(`URL image download failed: HTTP ${response.status}`);
            }
            const contentType = response.headers.get('content-type') ?? '';
            const mime = contentType.split(';', 1)[0].trim().toLowerCase();
            if (!mime.startsWith('image/')) {
                throw new Error(`URL response is not an image: ${contentType || 'missing content-type'}`);
            }
            const bytes = await readResponseBytes(response, options.maxImageBytes);
            const detected = detectImageMime(bytes);
            return {
                type: 'url',
                originalRef: urlText,
                bytes,
                sha256: sha256Hex(bytes),
                mime: detected.mime,
                ext: detected.ext,
            };
        }
        catch (error) {
            if (timedOut || isAbortError(error)) {
                throw new Error(`URL image download timed out after ${options.timeoutMs}ms`, { cause: error });
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
async function readResponseBytes(response, maxImageBytes) {
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
        const declaredLength = Number(contentLength);
        if (Number.isFinite(declaredLength) && declaredLength > maxImageBytes) {
            throw new Error(`Image exceeds max size: ${declaredLength}`);
        }
    }
    if (!response.body) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > maxImageBytes) {
            throw new Error(`Image exceeds max size: ${bytes.length}`);
        }
        return bytes;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            total += value.byteLength;
            if (total > maxImageBytes) {
                await reader.cancel();
                throw new Error(`Image exceeds max size: ${total}`);
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
//# sourceMappingURL=url-source.js.map