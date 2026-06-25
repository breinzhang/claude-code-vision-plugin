# Vision Bridge Manual MCP Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Vision Bridge MCP tools from the main Claude conversation and expose them only through a deterministic, user-invoked `/claude-vision-bridge:mcp` command while preserving automatic Hook image analysis.

**Architecture:** The existing `UserPromptSubmit` Hook remains the only automatic image path and skips only the exact manual command. A new manual-only plugin Skill triggers a `UserPromptExpansion` Hook, which parses friendly aliases or exact MCP tool names, opens an in-memory MCP client/server pair, performs `tools/list` and optionally `tools/call`, closes the pair, and injects the completed result into Claude context.

**Tech Stack:** TypeScript, Node.js 20+, Vitest, Claude Code plugin Skills/Hooks, `@modelcontextprotocol/sdk`, Zod, esbuild.

## Global Constraints

- Normal pasted images, image paths, and image URLs always use `UserPromptSubmit`.
- The main Claude conversation must not load a Vision Bridge MCP server.
- MCP execution requires the exact user command `/claude-vision-bridge:mcp`.
- The Skill must set `disable-model-invocation: true`.
- The fixed command name is not configurable.
- Friendly aliases default to `analyze`, `doctor`, `clean`, and `tools`, are configurable in plugin options, and must be unique non-empty command tokens.
- Exact MCP tool names returned by `tools/list` remain callable and take precedence over aliases.
- `analyze` accepts exactly one clipboard chip, path, or URL and natural-language prompt text; users do not write JSON for current tools.
- Future tools without friendly adapters accept an optional JSON object.
- No command argument may be executed through a shell.
- Temporary MCP client and server connections must close on success and failure.
- Provider routing, URL security policy, cache semantics, and result normalization remain unchanged.

---

## File Map

- `plugins/claude-vision-bridge/src/core/infer-vision-mode.ts`: shared Chinese/English OCR intent inference.
- `plugins/claude-vision-bridge/src/config/load-config.ts`: load configurable command aliases.
- `plugins/claude-vision-bridge/src/core/schema.ts`: validate aliases and uniqueness.
- `plugins/claude-vision-bridge/src/core/types.ts`: expose alias fields on `PluginConfig`.
- `plugins/claude-vision-bridge/src/hook/handler.ts`: automatic Hook routing; exact manual-command exclusion only.
- `plugins/claude-vision-bridge/src/command/manual-mcp-command.ts`: pure argument parsing, alias resolution, friendly adapters, temporary MCP lifecycle.
- `plugins/claude-vision-bridge/src/hook/manual-mcp-command-handler.ts`: `UserPromptExpansion` input/output adapter.
- `plugins/claude-vision-bridge/skills/mcp/SKILL.md`: user-only namespaced command.
- `plugins/claude-vision-bridge/hooks/hooks.json`: register automatic and manual command Hooks.
- `plugins/claude-vision-bridge/scripts/copy-entrypoints.mjs`: build the manual command Hook entrypoint.
- `plugins/claude-vision-bridge/.claude-plugin/plugin.json`: declare alias options.
- `plugins/claude-vision-bridge/.mcp.json`: delete persistent main-session MCP registration.
- `plugins/claude-vision-bridge/test/unit/manual-mcp-command.test.ts`: parser, aliases, adapters, future tool arguments.
- `plugins/claude-vision-bridge/test/integration/manual-mcp-command-handler.test.ts`: Hook JSON and temporary MCP lifecycle.
- `plugins/claude-vision-bridge/test/integration/hook-handler.test.ts`: deterministic automatic/manual routing.
- `plugins/claude-vision-bridge/test/unit/manifest.test.ts`: packaging and plugin component assertions.
- `plugins/claude-vision-bridge/test/unit/schema.test.ts`: alias config validation and settings loading.
- `plugins/claude-vision-bridge/README.md`: document automatic and manual usage.

---

### Task 1: Add Validated Manual Command Configuration

**Files:**
- Modify: `plugins/claude-vision-bridge/src/core/types.ts`
- Modify: `plugins/claude-vision-bridge/src/core/schema.ts`
- Modify: `plugins/claude-vision-bridge/src/config/load-config.ts`
- Modify: `plugins/claude-vision-bridge/.claude-plugin/plugin.json`
- Test: `plugins/claude-vision-bridge/test/unit/schema.test.ts`

**Interfaces:**
- Produces: `PluginConfig.mcpAnalyzeCommand`, `mcpDoctorCommand`, `mcpCleanCommand`, and `mcpToolsCommand`.
- Consumes: existing `pluginOption()` environment/settings fallback.

- [ ] **Step 1: Write failing alias config tests**

Add to `test/unit/schema.test.ts`:

```ts
it('loads default and configured manual MCP command aliases', () => {
  expect(PluginConfigSchema.parse({})).toMatchObject({
    mcpAnalyzeCommand: 'analyze',
    mcpDoctorCommand: 'doctor',
    mcpCleanCommand: 'clean',
    mcpToolsCommand: 'tools',
  });

  const config = loadConfig({
    CLAUDE_PLUGIN_OPTION_MCP_ANALYZE_COMMAND: 'see',
    CLAUDE_PLUGIN_OPTION_MCP_DOCTOR_COMMAND: 'health',
    CLAUDE_PLUGIN_OPTION_MCP_CLEAN_COMMAND: 'purge',
    CLAUDE_PLUGIN_OPTION_MCP_TOOLS_COMMAND: 'list',
  });

  expect(config).toMatchObject({
    mcpAnalyzeCommand: 'see',
    mcpDoctorCommand: 'health',
    mcpCleanCommand: 'purge',
    mcpToolsCommand: 'list',
  });
});

it('rejects invalid or duplicate manual MCP aliases', () => {
  expect(() => PluginConfigSchema.parse({ mcpAnalyzeCommand: 'two words' })).toThrow();
  expect(() =>
    PluginConfigSchema.parse({
      mcpAnalyzeCommand: 'vision',
      mcpDoctorCommand: 'vision',
    }),
  ).toThrow(/unique/i);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/schema.test.ts
```

Expected: FAIL because `PluginConfig` and `PluginConfigSchema` do not contain alias fields.

- [ ] **Step 3: Add alias fields and validation**

Add to `PluginConfig`:

```ts
mcpAnalyzeCommand: string;
mcpDoctorCommand: string;
mcpCleanCommand: string;
mcpToolsCommand: string;
```

Add to `PluginConfigSchema`:

```ts
const commandAliasSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const PluginConfigSchema = z
  .object({
    // existing fields
    mcpAnalyzeCommand: commandAliasSchema.default('analyze'),
    mcpDoctorCommand: commandAliasSchema.default('doctor'),
    mcpCleanCommand: commandAliasSchema.default('clean'),
    mcpToolsCommand: commandAliasSchema.default('tools'),
  })
  .superRefine((config, context) => {
    const aliases = [
      config.mcpAnalyzeCommand,
      config.mcpDoctorCommand,
      config.mcpCleanCommand,
      config.mcpToolsCommand,
    ];
    if (new Set(aliases).size !== aliases.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manual MCP command aliases must be unique.',
      });
    }
  });
```

Pass the four values from `loadConfig()`:

```ts
mcpAnalyzeCommand:
  configuredValue(pluginOption(env, settingsOptions, 'mcp_analyze_command')) ?? 'analyze',
mcpDoctorCommand:
  configuredValue(pluginOption(env, settingsOptions, 'mcp_doctor_command')) ?? 'doctor',
mcpCleanCommand:
  configuredValue(pluginOption(env, settingsOptions, 'mcp_clean_command')) ?? 'clean',
mcpToolsCommand:
  configuredValue(pluginOption(env, settingsOptions, 'mcp_tools_command')) ?? 'tools',
```

Declare matching string options with the same defaults in `plugin.json`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/schema.test.ts
```

Expected: all schema tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/claude-vision-bridge/src/core/types.ts \
  plugins/claude-vision-bridge/src/core/schema.ts \
  plugins/claude-vision-bridge/src/config/load-config.ts \
  plugins/claude-vision-bridge/.claude-plugin/plugin.json \
  plugins/claude-vision-bridge/test/unit/schema.test.ts
git commit -m "feat: configure manual vision mcp aliases"
```

---

### Task 2: Make Automatic Hook Routing Exact And Share OCR Inference

**Files:**
- Create: `plugins/claude-vision-bridge/src/core/infer-vision-mode.ts`
- Modify: `plugins/claude-vision-bridge/src/hook/handler.ts`
- Test: `plugins/claude-vision-bridge/test/integration/hook-handler.test.ts`

**Interfaces:**
- Produces: `inferVisionMode(prompt: string): VisionMode`.
- Produces: `isManualMcpCommandPrompt(prompt: string): boolean`.
- Consumes: fixed command prefix `/claude-vision-bridge:mcp`.

- [ ] **Step 1: Replace the heuristic routing test with exact routing tests**

Replace the current “explicitly asks for MCP” test with:

```ts
it('skips automatic analysis only for the exact manual MCP command', () => {
  const manual = parseHookInputToRequests({
    session_id: 's',
    cwd: process.cwd(),
    hook_event_name: 'UserPromptSubmit',
    prompt: '/claude-vision-bridge:mcp analyze [Image #1] 读取文字',
  });
  const discussion = parseHookInputToRequests({
    session_id: 's',
    cwd: process.cwd(),
    hook_event_name: 'UserPromptSubmit',
    prompt: '这里 MCP analyze_image 报错了，请看 [Image #1]',
  });

  expect(manual).toEqual([]);
  expect(discussion).toHaveLength(1);
  expect(discussion[0].source).toEqual({ type: 'clipboard', origin: 'hook' });
});

it('does not skip other slash commands that include images', () => {
  const requests = parseHookInputToRequests({
    session_id: 's',
    cwd: process.cwd(),
    hook_event_name: 'UserPromptSubmit',
    prompt: '/other-plugin:inspect [Image #1]',
  });

  expect(requests).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/integration/hook-handler.test.ts
```

Expected: discussion test FAILS because the current broad MCP matcher skips analysis.

- [ ] **Step 3: Extract shared mode inference and exact command detection**

Create `src/core/infer-vision-mode.ts`:

```ts
import type { VisionMode } from './types.js';

export function inferVisionMode(prompt: string): VisionMode {
  if (/\bocr\b/i.test(prompt)) return 'ocr';
  if (/(提取|识别|读取|转写).{0,12}(文字|文本)/.test(prompt)) return 'ocr';
  if (/(看得见|可见).{0,8}(文字|文本)/.test(prompt)) return 'ocr';
  if (/\b(extract|read|transcribe)\b.{0,24}\b(visible\s+)?text\b/i.test(prompt)) return 'ocr';
  if (/\bvisible\s+text\b/i.test(prompt)) return 'ocr';
  return 'general';
}
```

In `handler.ts`:

```ts
import { inferVisionMode } from '../core/infer-vision-mode.js';

export function isManualMcpCommandPrompt(prompt: string): boolean {
  return /^\/claude-vision-bridge:mcp(?:\s|$)/i.test(prompt.trimStart());
}

export function parseHookInputToRequests(input: UserPromptSubmitInput): AnalyzeImageRequest[] {
  if (isManualMcpCommandPrompt(input.prompt)) return [];
  const sources = extractSourcesFromPrompt(input.prompt);
  const mode = inferVisionMode(input.prompt);
  // existing mapping
}
```

Delete `hasExplicitMcpVisionIntent()` and the private `inferHookMode()`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/integration/hook-handler.test.ts
```

Expected: all Hook tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/claude-vision-bridge/src/core/infer-vision-mode.ts \
  plugins/claude-vision-bridge/src/hook/handler.ts \
  plugins/claude-vision-bridge/test/integration/hook-handler.test.ts
git commit -m "fix: route manual vision command exactly"
```

---

### Task 3: Implement Pure Manual Command Parsing And Adapters

**Files:**
- Create: `plugins/claude-vision-bridge/src/command/manual-mcp-command.ts`
- Test: `plugins/claude-vision-bridge/test/unit/manual-mcp-command.test.ts`

**Interfaces:**
- Consumes: `PluginConfig`, `inferVisionMode()`, `extractSourcesFromPrompt()`.
- Produces:

```ts
export type ParsedManualMcpCommand =
  | { kind: 'list-tools' }
  | { kind: 'call-tool'; toolName: string; arguments: Record<string, unknown> };

export function parseManualMcpCommand(input: {
  commandArgs: string;
  originalPrompt: string;
  config: PluginConfig;
  availableToolNames: string[];
}): ParsedManualMcpCommand;
```

- [ ] **Step 1: Write failing parser tests**

Create `test/unit/manual-mcp-command.test.ts` with focused cases:

```ts
it('maps analyze alias and pasted image to analyze_image arguments', () => {
  expect(
    parseManualMcpCommand({
      commandArgs: 'analyze [Image #1] 请读取可见文字',
      originalPrompt: '/claude-vision-bridge:mcp analyze [Image #1] 请读取可见文字',
      config: pluginConfig(),
      availableToolNames: ['analyze_image', 'doctor_providers', 'clear_vision_cache'],
    }),
  ).toEqual({
    kind: 'call-tool',
    toolName: 'analyze_image',
    arguments: {
      source: { type: 'clipboard' },
      mode: 'ocr',
      prompt: '请读取可见文字',
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
  expect(parse('tools')).toEqual({ kind: 'list-tools' });
});

it('prefers an exact discovered tool name over an alias', () => {
  const config = { ...pluginConfig(), mcpDoctorCommand: 'future_tool' };
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

it('rejects missing, multiple, or malformed image sources', () => {
  expect(() => parse('analyze 读取文字')).toThrow(/image source/i);
  expect(() => parse('analyze [Image #1] ./screen.png 读取文字')).toThrow(/exactly one/i);
  expect(() => parse('future_tool {bad json}')).toThrow(/JSON/i);
});
```

The test helper `pluginConfig()` must include all current `PluginConfig` fields
and the four default aliases.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/manual-mcp-command.test.ts
```

Expected: FAIL because `manual-mcp-command.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure parser**

Implement:

```ts
const defaultImagePrompt = 'Describe the image for a coding agent.';

export function parseManualMcpCommand(input: {
  commandArgs: string;
  originalPrompt: string;
  config: PluginConfig;
  availableToolNames: string[];
}): ParsedManualMcpCommand {
  const { token, remainder } = splitFirstToken(input.commandArgs);
  if (!token) throw new Error(manualMcpUsage(input.config));

  if (input.availableToolNames.includes(token)) {
    return parseExactTool(token, remainder, input);
  }

  if (token === input.config.mcpToolsCommand) return { kind: 'list-tools' };
  if (token === input.config.mcpAnalyzeCommand) return parseAnalyze(remainder, input);
  if (token === input.config.mcpDoctorCommand) {
    requireNoArguments(remainder, token);
    return { kind: 'call-tool', toolName: 'doctor_providers', arguments: {} };
  }
  if (token === input.config.mcpCleanCommand) {
    return {
      kind: 'call-tool',
      toolName: 'clear_vision_cache',
      arguments: { kind: parseCacheKind(remainder) },
    };
  }

  throw new Error(`Unknown Vision Bridge MCP tool or alias: ${token}`);
}
```

Implement helpers with these exact behaviors:

- `splitFirstToken()` trims and separates the first whitespace-delimited token.
- `parseAnalyze()` calls `extractSourcesFromPrompt(remainder)`, requires one
  source, converts its origin to `mcp`, strips the source token/chip from the
  question, and uses `inferVisionMode(question)`.
- `analyze_image`, `doctor_providers`, and `clear_vision_cache` exact names reuse
  the friendly adapters.
- Unknown exact tools parse an empty remainder as `{}` or parse one JSON object.
- `parseCacheKind()` accepts `all`, `success`, `failure`, and defaults to `all`.
- `manualMcpUsage()` lists configured aliases and exact current tool names.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/manual-mcp-command.test.ts
```

Expected: all parser tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/claude-vision-bridge/src/command/manual-mcp-command.ts \
  plugins/claude-vision-bridge/test/unit/manual-mcp-command.test.ts
git commit -m "feat: parse manual vision mcp commands"
```

---

### Task 4: Execute Commands Through A Temporary MCP Session

**Files:**
- Modify: `plugins/claude-vision-bridge/src/command/manual-mcp-command.ts`
- Create: `plugins/claude-vision-bridge/src/hook/manual-mcp-command-handler.ts`
- Create: `plugins/claude-vision-bridge/test/integration/manual-mcp-command-handler.test.ts`
- Modify: `plugins/claude-vision-bridge/scripts/copy-entrypoints.mjs`

**Interfaces:**
- Consumes: `createMcpServer()`, `parseManualMcpCommand()`, `loadConfig()`.
- Produces:

```ts
export async function executeManualMcpCommand(input: {
  commandArgs: string;
  originalPrompt: string;
  cwd: string;
  config: PluginConfig;
}): Promise<string>;

export async function runManualMcpCommandHook(rawInput: string): Promise<string>;
```

- [ ] **Step 1: Write failing lifecycle and Hook tests**

Create `test/integration/manual-mcp-command-handler.test.ts`:

```ts
it('lists tools without calling a tool', async () => {
  const session = fakeSession({
    tools: [{ name: 'analyze_image', description: 'Analyze image', inputSchema: { type: 'object' } }],
  });

  const output = await executeManualMcpCommand(
    commandInput('tools'),
    session.dependencies,
  );

  expect(output).toContain('analyze_image');
  expect(session.listTools).toHaveBeenCalledTimes(1);
  expect(session.callTool).not.toHaveBeenCalled();
  expect(session.close).toHaveBeenCalledTimes(1);
});

it('calls one resolved tool and closes after success', async () => {
  const session = fakeSession({
    tools: [{ name: 'doctor_providers', description: 'Doctor', inputSchema: { type: 'object' } }],
    callResult: { content: [{ type: 'text', text: '{"providerOrder":["omlx"]}' }] },
  });

  const output = await executeManualMcpCommand(
    commandInput('doctor'),
    session.dependencies,
  );

  expect(session.callTool).toHaveBeenCalledWith({
    name: 'doctor_providers',
    arguments: {},
  });
  expect(output).toContain('providerOrder');
  expect(session.close).toHaveBeenCalledTimes(1);
});

it('closes the temporary session after a tool failure', async () => {
  const session = fakeSession({
    tools: [{ name: 'doctor_providers', description: 'Doctor', inputSchema: { type: 'object' } }],
    callError: new Error('tool failed'),
  });

  await expect(
    executeManualMcpCommand(commandInput('doctor'), session.dependencies),
  ).rejects.toThrow('tool failed');
  expect(session.close).toHaveBeenCalledTimes(1);
});

it('renders UserPromptExpansion additionalContext', async () => {
  const output = await runManualMcpCommandHook(
    JSON.stringify({
      session_id: 's',
      cwd: '/work',
      hook_event_name: 'UserPromptExpansion',
      expansion_type: 'slash_command',
      command_name: 'claude-vision-bridge:mcp',
      command_args: 'doctor',
      command_source: 'plugin',
      prompt: '/claude-vision-bridge:mcp doctor',
    }),
  );

  const parsed = JSON.parse(output);
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptExpansion');
  expect(parsed.hookSpecificOutput.additionalContext).toContain('Vision Bridge MCP Command');
});
```

Use dependency injection for tests rather than mocking SDK internals:

```ts
export interface ManualMcpSession {
  listTools(): Promise<{ tools: Tool[] }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<CallToolResult>;
  close(): Promise<void>;
}
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/integration/manual-mcp-command-handler.test.ts
```

Expected: FAIL because execution and Hook handler exports do not exist.

- [ ] **Step 3: Implement in-memory MCP session and execution**

Add imports:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../mcp/server.js';
```

Implement the production session factory:

```ts
async function createInMemorySession(): Promise<ManualMcpSession> {
  const server = await createMcpServer();
  const client = new Client(
    { name: 'vision-bridge-manual-command', version: '0.1.5' },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    listTools: () => client.listTools(),
    callTool: ({ name, arguments: args }) => client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
```

Implement `executeManualMcpCommand()`:

```ts
export async function executeManualMcpCommand(
  input: ManualMcpExecutionInput,
  dependencies: ManualMcpDependencies = { createSession: createInMemorySession },
): Promise<string> {
  const session = await dependencies.createSession();
  try {
    const listed = await session.listTools();
    const parsed = parseManualMcpCommand({
      commandArgs: input.commandArgs,
      originalPrompt: input.originalPrompt,
      config: input.config,
      availableToolNames: listed.tools.map((tool) => tool.name),
    });
    if (parsed.kind === 'list-tools') return renderToolList(listed.tools);
    const result = await session.callTool({
      name: parsed.toolName,
      arguments: parsed.arguments,
    });
    return renderToolResult(parsed.toolName, result);
  } finally {
    await session.close();
  }
}
```

Render only text content blocks plus a short heading. Do not dump duplicated
`structuredContent` when equivalent text content already exists.

- [ ] **Step 4: Implement `UserPromptExpansion` Hook adapter**

Create `src/hook/manual-mcp-command-handler.ts` with:

```ts
export interface UserPromptExpansionInput {
  session_id: string;
  cwd: string;
  hook_event_name: 'UserPromptExpansion';
  expansion_type: 'slash_command' | 'mcp_prompt';
  command_name: string;
  command_args: string;
  command_source: string;
  prompt: string;
}

export function buildManualMcpHookOutput(additionalContext: string) {
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptExpansion' as const,
      additionalContext,
    },
  };
}
```

`runManualMcpCommandHook()` must:

- require `expansion_type === 'slash_command'`
- require `command_name === 'claude-vision-bridge:mcp'`
- require `command_source === 'plugin'`
- load config
- call `executeManualMcpCommand()`
- return a JSON line containing `## Vision Bridge MCP Command Result`
- catch errors and return `## Vision Bridge MCP Command Failed` as context

Add a stdin `main()` matching the existing Hook entrypoint pattern.

- [ ] **Step 5: Build the new entrypoint**

Add:

```js
{ entry: 'src/hook/manual-mcp-command-handler.ts', outfile: 'dist/manual-mcp-command-handler.js' },
```

to `scripts/copy-entrypoints.mjs`.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/manual-mcp-command.test.ts test/integration/manual-mcp-command-handler.test.ts
npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/claude-vision-bridge/src/command/manual-mcp-command.ts \
  plugins/claude-vision-bridge/src/hook/manual-mcp-command-handler.ts \
  plugins/claude-vision-bridge/test/integration/manual-mcp-command-handler.test.ts \
  plugins/claude-vision-bridge/scripts/copy-entrypoints.mjs
git commit -m "feat: execute manual vision mcp commands"
```

---

### Task 5: Package The Manual Skill And Remove Main-Session MCP

**Files:**
- Create: `plugins/claude-vision-bridge/skills/mcp/SKILL.md`
- Modify: `plugins/claude-vision-bridge/hooks/hooks.json`
- Delete: `plugins/claude-vision-bridge/.mcp.json`
- Modify: `plugins/claude-vision-bridge/test/unit/manifest.test.ts`
- Modify: `plugins/claude-vision-bridge/README.md`

**Interfaces:**
- Consumes: `dist/hook-handler.js`, `dist/manual-mcp-command-handler.js`.
- Produces: user command `/claude-vision-bridge:mcp`.

- [ ] **Step 1: Write failing packaging tests**

Replace the `.mcp.json` environment test in `manifest.test.ts` with:

```ts
it('packages a manual-only MCP skill without a main-session MCP server', () => {
  expect(existsSync(resolve('.mcp.json'))).toBe(false);

  const skill = readFileSync(resolve('skills/mcp/SKILL.md'), 'utf8');
  expect(skill).toContain('disable-model-invocation: true');

  const hooks = readJson('hooks/hooks.json') as {
    hooks: {
      UserPromptSubmit: unknown[];
      UserPromptExpansion: Array<{ matcher: string; hooks: Array<{ args: string[] }> }>;
    };
  };
  expect(hooks.hooks.UserPromptSubmit).toHaveLength(1);
  expect(hooks.hooks.UserPromptExpansion[0].matcher).toBe('claude-vision-bridge:mcp');
  expect(hooks.hooks.UserPromptExpansion[0].hooks[0].args).toContain(
    '${CLAUDE_PLUGIN_ROOT}/dist/manual-mcp-command-handler.js',
  );
});

it('declares configurable manual MCP aliases', () => {
  const plugin = readJson('.claude-plugin/plugin.json') as {
    userConfig: Record<string, { default?: string }>;
  };
  expect(plugin.userConfig.mcp_analyze_command.default).toBe('analyze');
  expect(plugin.userConfig.mcp_doctor_command.default).toBe('doctor');
  expect(plugin.userConfig.mcp_clean_command.default).toBe('clean');
  expect(plugin.userConfig.mcp_tools_command.default).toBe('tools');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/manifest.test.ts
```

Expected: FAIL because `.mcp.json` still exists and the Skill/Hook registration is absent.

- [ ] **Step 3: Add the Skill and Hook registration**

Create `skills/mcp/SKILL.md`:

```md
---
description: Manually run a Claude Vision Bridge MCP tool
disable-model-invocation: true
---

The Claude Vision Bridge command hook has already executed:

`/claude-vision-bridge:mcp $ARGUMENTS`

Use the injected `Vision Bridge MCP Command Result` or failure context to answer
the user. Do not call another image, OCR, MCP, Bash, or Read tool to repeat the
operation.
```

Add to `hooks/hooks.json`:

```json
"UserPromptExpansion": [
  {
    "matcher": "claude-vision-bridge:mcp",
    "hooks": [
      {
        "type": "command",
        "command": "node",
        "args": ["${CLAUDE_PLUGIN_ROOT}/dist/manual-mcp-command-handler.js"],
        "timeout": 120
      }
    ]
  }
]
```

Delete `.mcp.json`.

- [ ] **Step 4: Update README**

Document:

```text
Normal image prompts use the automatic Hook.

/claude-vision-bridge:mcp analyze [paste image] 图片中显示的是几点？
/claude-vision-bridge:mcp doctor
/claude-vision-bridge:mcp clean failure
/claude-vision-bridge:mcp tools
```

State that Vision Bridge is intentionally absent from `/mcp`, exact tool names
remain accepted through the command, and aliases are configured under plugin
options in `~/.claude/settings.json`.

- [ ] **Step 5: Run packaging tests and build**

Run:

```bash
cd plugins/claude-vision-bridge
npm test -- test/unit/manifest.test.ts
npm run build
test -x dist/manual-mcp-command-handler.js
```

Expected: packaging test passes, build exits 0, entrypoint exists and is executable.

- [ ] **Step 6: Commit**

```bash
git add plugins/claude-vision-bridge/skills/mcp/SKILL.md \
  plugins/claude-vision-bridge/hooks/hooks.json \
  plugins/claude-vision-bridge/test/unit/manifest.test.ts \
  plugins/claude-vision-bridge/README.md \
  plugins/claude-vision-bridge/scripts/copy-entrypoints.mjs \
  plugins/claude-vision-bridge/dist
git add -u plugins/claude-vision-bridge/.mcp.json
git commit -m "feat: expose vision mcp through manual command"
```

---

### Task 6: Verify Full Behavior And Fresh Claude Sessions

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Verifies all prior task outputs together.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
cd plugins/claude-vision-bridge
npm test
npm run typecheck
npm run build
claude plugin validate . --strict
```

Expected: all tests pass, typecheck/build succeed, plugin validation passes.

- [ ] **Step 2: Verify repository hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional generated/build changes before final commit.

- [ ] **Step 3: Verify normal Hook path in a fresh process**

Start a fresh non-interactive Claude process with the repo plugin:

```bash
claude --plugin-dir ./plugins/claude-vision-bridge \
  --debug-file /tmp/vision-hook-only-debug.log \
  -p "请分析 ./.test-tmp/vision-smoke.png 中的可见文字"
```

- debug log contains successful `UserPromptSubmit`
- response uses `Image Pixel Evidence`
- debug/transcript contains no Vision Bridge MCP tool call
- debug tool inventory does not expose `vision-bridge`

- [ ] **Step 4: Verify manual command path in a fresh interactive process**

Run:

```bash
claude --plugin-dir ./plugins/claude-vision-bridge \
  --debug-file /tmp/vision-manual-mcp-debug.log
```

Inside the fresh session:

```text
[paste image] 图片中显示的是几点？
/claude-vision-bridge:mcp tools
/claude-vision-bridge:mcp doctor
/claude-vision-bridge:mcp analyze [paste image] 图片中显示的是几点？
```

Expected:

- the first pasted-image prompt runs only automatic `UserPromptSubmit` analysis
- `UserPromptSubmit` skips automatic image analysis for each exact command
- `UserPromptExpansion` runs once per command
- `tools` lists current server tools
- `doctor` returns redacted configuration
- `analyze` uses the configured local provider
- no persistent Vision Bridge MCP tool appears in the conversation

- [ ] **Step 5: Verify configured alias**

Using a temporary settings JSON passed with `--settings`, set:

```json
{
  "pluginConfigs": {
    "claude-vision-bridge@brein-claude-tools": {
      "options": {
        "mcp_doctor_command": "health"
      }
    }
  }
}
```

Expected:

```text
/claude-vision-bridge:mcp health
```

works, and:

```text
/claude-vision-bridge:mcp doctor_providers
```

still works.

- [ ] **Step 6: Route verification defects back through TDD**

If verification exposes a defect, return to the task that owns the behavior,
add a focused failing regression test, verify RED, implement the minimal fix,
verify GREEN, and commit with that task's commit message pattern. If no defect
is found, do not create an empty commit.
