import { readFileSync } from 'node:fs';
import { AnalyzeImageRequestSchema } from '../core/schema.js';
import type { AnalyzeImageRequest, AnalyzeImageResult } from '../core/types.js';
import { VisionService } from '../core/vision-service.js';
import { loadConfig } from '../config/load-config.js';
import { buildFailureArtifact } from '../failure/failure-artifact.js';
import { extractSourcesFromPrompt } from '../sources/extract-from-prompt.js';

export interface UserPromptSubmitInput {
  session_id: string;
  transcript_path?: string;
  cwd: string;
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
  permission_mode?: string;
}

export function parseHookInputToRequests(input: UserPromptSubmitInput): AnalyzeImageRequest[] {
  const sources = extractSourcesFromPrompt(input.prompt);
  return sources.map((source) =>
    AnalyzeImageRequestSchema.parse({
      source,
      mode: 'general',
      prompt: input.prompt,
      timeoutMs: Number(process.env.CLAUDE_PLUGIN_OPTION_HOOK_TIMEOUT_MS ?? 30000),
      maxOutputChars: Number(process.env.CLAUDE_PLUGIN_OPTION_MAX_OUTPUT_CHARS ?? 8000),
    }),
  );
}

export function buildHookOutput(markdowns: string[]): {
  suppressOutput: boolean;
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit'; additionalContext: string };
} {
  return {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: markdowns.join('\n\n---\n\n'),
    },
  };
}

export async function runHook(rawInput: string): Promise<string> {
  try {
    const input = JSON.parse(rawInput) as UserPromptSubmitInput;
    const requests = parseHookInputToRequests(input);
    if (requests.length === 0) return '';

    const service = new VisionService(loadConfig());
    const results = await service.analyzeMany(requests, { cwd: input.cwd });
    return `${JSON.stringify(buildHookOutput(results.map((result) => result.markdown)))}\n`;
  } catch (error) {
    const artifact: AnalyzeImageResult = buildFailureArtifact({
      category: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : String(error),
      attemptedProviders: [],
      remoteFallbackAllowed: false,
    });
    return `${JSON.stringify(buildHookOutput([artifact.markdown]))}\n`;
  }
}

async function main(): Promise<void> {
  const raw = readFileSync(0, 'utf8');
  const output = await runHook(raw);
  if (output) process.stdout.write(output);
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
