import { createHash } from 'node:crypto';
export function sha256Hex(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
export function stableJsonHash(value) {
    return sha256Hex(JSON.stringify(sortJson(value)));
}
function sortJson(value) {
    if (Array.isArray(value))
        return value.map(sortJson);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, sortJson(item)]));
    }
    return value;
}
//# sourceMappingURL=hash.js.map