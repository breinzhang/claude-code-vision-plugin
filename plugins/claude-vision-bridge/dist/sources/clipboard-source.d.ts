import type { ResolvedImageSource } from '../core/types.js';
export interface ClipboardReader {
    readImageBytes(): Promise<Buffer | null>;
}
export interface ClipboardOptions {
    pluginDataDir: string;
    maxImageBytes: number;
    reader?: ClipboardReader;
}
export declare function resolveClipboardImage(options: ClipboardOptions): Promise<ResolvedImageSource>;
