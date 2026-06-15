import type { VisionStructuredOutput } from '../core/types.js';
export declare function renderVisionMarkdown(input: {
    sourceLabel: string;
    providerLabel: string;
    output: VisionStructuredOutput;
    maxOutputChars: number;
}): string;
