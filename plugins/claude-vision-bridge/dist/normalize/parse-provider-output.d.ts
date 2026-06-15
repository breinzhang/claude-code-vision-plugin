import type { VisionMode, VisionStructuredOutput } from '../core/types.js';
export declare function parseProviderOutput(input: {
    mode: VisionMode;
    text: string;
}): VisionStructuredOutput;
