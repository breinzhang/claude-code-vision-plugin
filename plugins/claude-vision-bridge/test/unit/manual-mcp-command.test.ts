import { describe, expect, it } from 'vitest';
import { PluginConfigSchema } from '../../src/core/schema.js';
import {
  parseManualMcpCommand,
  type ParsedManualMcpCommand,
} from '../../src/command/manual-mcp-command.js';

const availableToolNames = ['analyze_image', 'doctor_providers', 'clear_vision_cache'];

describe('manual MCP command parser', () => {
  it('maps analyze alias and pasted image to analyze_image arguments', () => {
    expect(parse('analyze [Image #1] 请读取可见文字')).toEqual({
      kind: 'call-tool',
      toolName: 'analyze_image',
      arguments: {
        source: { type: 'clipboard' },
        mode: 'ocr',
        prompt: '请读取可见文字',
      },
    });
  });

  it('maps analyze paths and URLs without including the source in the question', () => {
    expect(parse('analyze "./screen shot.png" describe the layout')).toEqual({
      kind: 'call-tool',
      toolName: 'analyze_image',
      arguments: {
        source: { type: 'path', path: './screen shot.png' },
        mode: 'general',
        prompt: 'describe the layout',
      },
    });

    expect(parse('analyze https://example.com/screen.png read visible text')).toEqual({
      kind: 'call-tool',
      toolName: 'analyze_image',
      arguments: {
        source: { type: 'url', url: 'https://example.com/screen.png' },
        mode: 'ocr',
        prompt: 'read visible text',
      },
    });
  });

  it('maps doctor, clean, and tools aliases', () => {
    expect(parse('doctor')).toEqual({
      kind: 'call-tool',
      toolName: 'doctor_providers',
      arguments: {},
    });
    expect(parse('clean failure')).toEqual({
      kind: 'call-tool',
      toolName: 'clear_vision_cache',
      arguments: { kind: 'failure' },
    });
    expect(parse('clean')).toEqual({
      kind: 'call-tool',
      toolName: 'clear_vision_cache',
      arguments: { kind: 'all' },
    });
    expect(parse('tools')).toEqual({ kind: 'list-tools' });
  });

  it('accepts current exact tool names through the friendly adapters', () => {
    expect(parse('analyze_image [Image #1] OCR')).toMatchObject({
      kind: 'call-tool',
      toolName: 'analyze_image',
      arguments: {
        source: { type: 'clipboard' },
        mode: 'ocr',
      },
    });
    expect(parse('doctor_providers')).toEqual({
      kind: 'call-tool',
      toolName: 'doctor_providers',
      arguments: {},
    });
    expect(parse('clear_vision_cache success')).toEqual({
      kind: 'call-tool',
      toolName: 'clear_vision_cache',
      arguments: { kind: 'success' },
    });
  });

  it('prefers an exact discovered tool name over an alias', () => {
    const config = PluginConfigSchema.parse({ mcpDoctorCommand: 'future_tool' });

    expect(
      parseManualMcpCommand({
        commandArgs: 'future_tool {"value":1}',
        originalPrompt: '/claude-vision-bridge:mcp future_tool {"value":1}',
        config,
        availableToolNames: ['future_tool', 'doctor_providers'],
      }),
    ).toEqual({
      kind: 'call-tool',
      toolName: 'future_tool',
      arguments: { value: 1 },
    });
  });

  it('accepts empty or object JSON arguments for future exact tools', () => {
    expect(parse('future_tool', ['future_tool'])).toEqual({
      kind: 'call-tool',
      toolName: 'future_tool',
      arguments: {},
    });
    expect(parse('future_tool {"option":"value"}', ['future_tool'])).toEqual({
      kind: 'call-tool',
      toolName: 'future_tool',
      arguments: { option: 'value' },
    });
  });

  it('rejects missing, multiple, or malformed image sources', () => {
    expect(() => parse('analyze 读取文字')).toThrow(/image source/i);
    expect(() => parse('analyze [Image #1] .\/screen.png 读取文字')).toThrow(/exactly one/i);
    expect(() => parse('future_tool {bad json}', ['future_tool'])).toThrow(/JSON/i);
    expect(() => parse('future_tool []', ['future_tool'])).toThrow(/JSON object/i);
  });

  it('rejects invalid maintenance arguments and unknown commands', () => {
    expect(() => parse('doctor extra')).toThrow(/does not accept arguments/i);
    expect(() => parse('clean expired')).toThrow(/all, success, or failure/i);
    expect(() => parse('missing_tool')).toThrow(/Unknown Vision Bridge MCP tool or alias/i);
  });
});

function parse(
  commandArgs: string,
  tools: string[] = availableToolNames,
): ParsedManualMcpCommand {
  return parseManualMcpCommand({
    commandArgs,
    originalPrompt: `/claude-vision-bridge:mcp ${commandArgs}`,
    config: PluginConfigSchema.parse({}),
    availableToolNames: tools,
  });
}
