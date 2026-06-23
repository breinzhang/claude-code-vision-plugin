import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeImageResult } from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  analyzeMany: vi.fn(),
  constructorConfigs: [] as unknown[],
  loadConfig: vi.fn(() => ({ pluginDataDir: '.vision-data' })),
}));

vi.mock('../../src/core/vision-service.js', () => ({
  VisionService: vi.fn(function VisionServiceMock(config: unknown) {
    mocks.constructorConfigs.push(config);
    return { analyzeMany: mocks.analyzeMany };
  }),
}));

vi.mock('../../src/config/load-config.js', () => ({
  loadConfig: mocks.loadConfig,
}));

import { buildHookOutput, parseHookInputToRequests, runHook } from '../../src/hook/handler.js';

describe('Hook handler', () => {
  afterEach(() => {
    delete process.env.CLAUDE_PLUGIN_OPTION_HOOK_TIMEOUT_MS;
    delete process.env.CLAUDE_PLUGIN_OPTION_MAX_OUTPUT_CHARS;
    mocks.analyzeMany.mockReset();
    mocks.constructorConfigs.length = 0;
    mocks.loadConfig.mockReset();
    mocks.loadConfig.mockReturnValue({ pluginDataDir: '.vision-data' });
  });

  it('creates no requests for prompts without images', () => {
    const requests = parseHookInputToRequests({
      session_id: 's',
      cwd: process.cwd(),
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hello world',
    });

    expect(requests).toEqual([]);
  });

  it('extracts path, URL, and clipboard requests for hook origin', () => {
    const requests = parseHookInputToRequests({
      session_id: 's',
      cwd: process.cwd(),
      hook_event_name: 'UserPromptSubmit',
      prompt: '看 ./a.png https://example.com/b.png [Image #1]',
    });

    expect(requests.map((item) => item.source)).toEqual([
      { type: 'path', path: './a.png', origin: 'hook' },
      { type: 'url', url: 'https://example.com/b.png', origin: 'hook' },
      { type: 'clipboard', origin: 'hook' },
    ]);
    expect(requests.map((item) => item.mode)).toEqual(['general', 'general', 'general']);
    expect(requests.map((item) => item.timeoutMs)).toEqual([30000, 30000, 30000]);
    expect(requests.map((item) => item.maxOutputChars)).toEqual([8000, 8000, 8000]);
  });

  it('skips automatic hook analysis when the prompt explicitly asks for MCP vision bridge', () => {
    const requests = parseHookInputToRequests({
      session_id: 's',
      cwd: process.cwd(),
      hook_event_name: 'UserPromptSubmit',
      prompt: '请使用 vision-bridge 的 analyze_image 工具看 ./screen.png',
    });

    expect(requests).toEqual([]);
  });

  it('uses hook timeout and max output environment overrides', () => {
    process.env.CLAUDE_PLUGIN_OPTION_HOOK_TIMEOUT_MS = '12000';
    process.env.CLAUDE_PLUGIN_OPTION_MAX_OUTPUT_CHARS = '3000';

    const requests = parseHookInputToRequests({
      session_id: 's',
      cwd: process.cwd(),
      hook_event_name: 'UserPromptSubmit',
      prompt: './a.png',
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      mode: 'general',
      timeoutMs: 12000,
      maxOutputChars: 3000,
    });
  });

  it('infers OCR mode when the prompt asks to extract visible text', () => {
    const requests = parseHookInputToRequests({
      session_id: 's',
      cwd: process.cwd(),
      hook_event_name: 'UserPromptSubmit',
      prompt: '只做OCR：请提取 ./screen.png 图片里看得见的文字',
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].mode).toBe('ocr');
  });

  it('renders Hook JSON with suppressOutput and additionalContext', () => {
    const output = buildHookOutput(['## Vision Analysis']);

    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(output.hookSpecificOutput.additionalContext).toContain('Vision Analysis');
  });

  it('returns empty output without creating a service when the prompt has no images', async () => {
    const output = await runHook(
      JSON.stringify({
        session_id: 's',
        cwd: process.cwd(),
        hook_event_name: 'UserPromptSubmit',
        prompt: 'hello world',
      }),
    );

    expect(output).toBe('');
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.constructorConfigs).toEqual([]);
    expect(mocks.analyzeMany).not.toHaveBeenCalled();
  });

  it('analyzes image requests with VisionService and returns Hook JSON', async () => {
    mocks.analyzeMany.mockResolvedValue([
      {
        artifactType: 'success',
        markdown: '## Vision Analysis\n\nA login screen.',
      } satisfies Partial<AnalyzeImageResult>,
    ]);

    const output = await runHook(
      JSON.stringify({
        session_id: 's',
        cwd: '/work',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'please inspect ./screen.png',
      }),
    );

    const parsed = JSON.parse(output) as ReturnType<typeof buildHookOutput>;
    expect(mocks.loadConfig).toHaveBeenCalledTimes(1);
    expect(mocks.constructorConfigs).toEqual([{ pluginDataDir: '.vision-data' }]);
    expect(mocks.analyzeMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          source: { type: 'path', path: './screen.png', origin: 'hook' },
          mode: 'general',
          prompt: 'please inspect ./screen.png',
        }),
      ],
      { cwd: '/work' },
    );
    expect(parsed.suppressOutput).toBe(true);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('A login screen.');
  });

  it('returns visible failure context instead of throwing on errors', async () => {
    mocks.analyzeMany.mockRejectedValue(new Error('provider exploded'));

    const output = await runHook(
      JSON.stringify({
        session_id: 's',
        cwd: process.cwd(),
        hook_event_name: 'UserPromptSubmit',
        prompt: 'please inspect ./screen.png',
      }),
    );

    const parsed = JSON.parse(output) as ReturnType<typeof buildHookOutput>;
    expect(parsed.suppressOutput).toBe(true);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Vision Analysis Failed');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('INTERNAL_ERROR');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('provider exploded');
  });
});
