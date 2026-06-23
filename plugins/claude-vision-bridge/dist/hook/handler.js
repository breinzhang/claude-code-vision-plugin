import { readFileSync } from 'node:fs';
import { AnalyzeImageRequestSchema } from '../core/schema.js';
import { VisionService } from '../core/vision-service.js';
import { loadConfig } from '../config/load-config.js';
import { buildFailureArtifact } from '../failure/failure-artifact.js';
import { extractSourcesFromPrompt } from '../sources/extract-from-prompt.js';
export function parseHookInputToRequests(input) {
    if (hasExplicitMcpVisionIntent(input.prompt))
        return [];
    const sources = extractSourcesFromPrompt(input.prompt);
    const mode = inferHookMode(input.prompt);
    return sources.map((source) => AnalyzeImageRequestSchema.parse({
        source,
        mode,
        prompt: input.prompt,
        timeoutMs: Number(process.env.CLAUDE_PLUGIN_OPTION_HOOK_TIMEOUT_MS ?? 30000),
        maxOutputChars: Number(process.env.CLAUDE_PLUGIN_OPTION_MAX_OUTPUT_CHARS ?? 8000),
    }));
}
function hasExplicitMcpVisionIntent(prompt) {
    if (/analyze_image|doctor_providers|clear_vision_cache|vision[-\s]?bridge/i.test(prompt))
        return true;
    return /\bmcp\b/i.test(prompt) && /(vision|image|screenshot|图片|截图|识图|视觉|看图)/i.test(prompt);
}
function inferHookMode(prompt) {
    if (/\bocr\b/i.test(prompt))
        return 'ocr';
    if (/(提取|识别|读取|转写).{0,12}(文字|文本)/.test(prompt))
        return 'ocr';
    if (/(看得见|可见).{0,8}(文字|文本)/.test(prompt))
        return 'ocr';
    if (/\b(extract|read|transcribe)\b.{0,24}\b(visible\s+)?text\b/i.test(prompt))
        return 'ocr';
    if (/\bvisible\s+text\b/i.test(prompt))
        return 'ocr';
    return 'general';
}
export function buildHookOutput(markdowns) {
    return {
        suppressOutput: true,
        hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: markdowns.join('\n\n---\n\n'),
        },
    };
}
export async function runHook(rawInput) {
    try {
        const input = JSON.parse(rawInput);
        const requests = parseHookInputToRequests(input);
        if (requests.length === 0)
            return '';
        const service = new VisionService(loadConfig());
        const results = await service.analyzeMany(requests, { cwd: input.cwd });
        return `${JSON.stringify(buildHookOutput(results.map((result) => result.markdown)))}\n`;
    }
    catch (error) {
        const artifact = buildFailureArtifact({
            category: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error),
            attemptedProviders: [],
            remoteFallbackAllowed: false,
        });
        return `${JSON.stringify(buildHookOutput([artifact.markdown]))}\n`;
    }
}
async function main() {
    const raw = readFileSync(0, 'utf8');
    const output = await runHook(raw);
    if (output)
        process.stdout.write(output);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        const artifact = buildFailureArtifact({
            category: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error),
            attemptedProviders: [],
            remoteFallbackAllowed: false,
        });
        process.stdout.write(`${JSON.stringify(buildHookOutput([artifact.markdown]))}\n`);
        process.exit(0);
    });
}
//# sourceMappingURL=handler.js.map