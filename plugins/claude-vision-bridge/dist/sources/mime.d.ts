export declare function supportedImageExtensions(): string[];
export declare function mimeForExtension(path: string): string | undefined;
export declare function detectImageMime(bytes: Buffer): {
    mime: string;
    ext: string;
};
