import type { ResolvedImageSource } from '../core/types.js';
export declare function decodeBase64Image(input: {
    mime: string;
    data: string;
    maxImageBytes: number;
}): ResolvedImageSource;
