# Vision Bridge Hook And Manual MCP Command Design

## Goal

Guarantee exactly one Vision Bridge execution path per user turn:

- Normal pasted images, image paths, and image URLs always use the automatic
  `UserPromptSubmit` Hook.
- Vision Bridge MCP tools are not exposed to the main Claude conversation.
- MCP runs only when the user explicitly types the plugin command
  `/claude-vision-bridge:mcp`.
- The manual command supports current and future MCP tools without requiring
  new command-routing code for every tool.

This removes model tool-selection from the routing decision.

## User Interface

The plugin provides one fixed, user-only command:

```text
/claude-vision-bridge:mcp <subcommand> [arguments]
```

The command name is fixed so documentation, command discovery, and plugin
namespacing remain stable. The current short subcommands are configurable.

### Analyze a pasted image

`analyze` must be present. Pasting an image alone continues to use the automatic
Hook path.

```text
/claude-vision-bridge:mcp analyze [Image #1] 图片中显示的是几点？
```

The user does not write JSON. The command adapter constructs:

```json
{
  "source": { "type": "clipboard" },
  "mode": "ocr",
  "prompt": "图片中显示的是几点？"
}
```

The mode is inferred with the same Chinese and English OCR rules used by the
automatic Hook. If no question is supplied, the prompt defaults to:

```text
Describe the image for a coding agent.
```

The same subcommand also accepts one image path or URL:

```text
/claude-vision-bridge:mcp analyze ./screen.png 读取状态栏
/claude-vision-bridge:mcp analyze https://example.com/screen.png 描述错误
```

Exactly one image source is accepted per manual `analyze` call. Multiple
sources return a usage error instead of choosing silently.

### Diagnostics, cache, and discovery

```text
/claude-vision-bridge:mcp doctor
/claude-vision-bridge:mcp clean failure
/claude-vision-bridge:mcp tools
```

Mappings:

```text
analyze -> analyze_image
doctor  -> doctor_providers
clean   -> clear_vision_cache
tools   -> MCP tools/list
```

`clean` accepts `all`, `success`, or `failure`, defaulting to `all`.

### Stable tool-name entrypoints

The real MCP tool names remain accepted as stable command entrypoints:

```text
/claude-vision-bridge:mcp analyze_image [Image #1] 读取文字
/claude-vision-bridge:mcp doctor_providers
/claude-vision-bridge:mcp clear_vision_cache failure
```

For future tools, the exact tool name returned by `tools/list` is immediately
callable:

```text
/claude-vision-bridge:mcp future_tool {"option":"value"}
```

Friendly adapters exist for the current image, doctor, and cache workflows.
Unknown future tool schemas use an optional JSON object as the advanced
fallback. JSON is not required for normal image analysis or current maintenance
commands.

## Configurable Aliases

The fixed command name is not configurable. The four short subcommands are
configured through plugin options in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "claude-vision-bridge@brein-claude-tools": {
      "options": {
        "mcp_analyze_command": "analyze",
        "mcp_doctor_command": "doctor",
        "mcp_clean_command": "clean",
        "mcp_tools_command": "tools"
      }
    }
  }
}
```

The same options appear in the Claude Code plugin configuration UI because they
are declared in `.claude-plugin/plugin.json`.

Aliases must be non-empty command tokens and must be unique. Real MCP tool names
remain available regardless of alias changes.

## Deterministic Routing

### Normal prompt

```text
User submits pasted image or image reference
  -> UserPromptSubmit Hook
  -> automatic VisionService analysis
  -> additionalContext
  -> Claude answers from Hook evidence
```

The main conversation has no Vision Bridge MCP server or tools, so it cannot
perform a second Vision Bridge MCP analysis.

### Manual command

```text
User types /claude-vision-bridge:mcp ...
  -> UserPromptSubmit Hook sees the exact command prefix
  -> automatic image analysis is skipped
  -> UserPromptExpansion Hook matches the exact command name
  -> parse subcommand and arguments
  -> create temporary MCP client/server connection
  -> tools/list
  -> tools/call when applicable
  -> close both sides
  -> inject the result as command context
  -> Claude reports the completed result without calling tools
```

The routing check is an exact command-prefix match, not a natural-language
intent classifier. Discussion containing words such as MCP, `analyze_image`, or
`vision-bridge` remains a normal Hook turn.

## Plugin Components

### Manual-only Skill

Add:

```text
skills/mcp/SKILL.md
```

Frontmatter includes:

```yaml
disable-model-invocation: true
```

This keeps the command in the user's slash-command menu while preventing Claude
from invoking it programmatically.

The Skill performs no shell interpolation and no MCP call itself. Its body tells
Claude that the matching Hook has already executed the requested operation and
that it should report the injected result.

### UserPromptSubmit Hook

The existing Hook keeps its current automatic analysis behavior except for one
exact exclusion:

```text
/claude-vision-bridge:mcp
```

When the submitted prompt starts with that command, it returns no automatic
analysis output. No session state or heuristic intent matching is needed.

### UserPromptExpansion Hook

Register a new command Hook matched to the plugin command name. It receives:

- `command_name`
- `command_args`
- `command_source`
- original `prompt`
- normal session and working-directory fields

It validates that the command came from this plugin, parses the subcommand, and
executes the temporary MCP request.

Successful output is injected with `additionalContext`. Invalid syntax, unknown
tools, invalid tool arguments, or MCP failures are returned as visible command
failure context without falling back to automatic image analysis.

The implementation is split into:

```text
src/command/manual-mcp-command.ts
src/hook/manual-mcp-command-handler.ts
dist/manual-mcp-command-handler.js
```

The command module owns alias resolution, argument adapters, and the temporary
MCP session. The Hook module only validates `UserPromptExpansion` input and
formats Claude Code Hook output.

### Temporary MCP Client

The Hook creates an SDK `Client` and connects it to `createMcpServer()` using a
linked in-memory transport for the duration of one command.

Every invocation:

1. Connects client and server.
2. Calls `tools/list`.
3. Resolves the alias or exact tool name.
4. Validates the tool exists.
5. Calls `tools/call`, except for the `tools` meta-command.
6. Closes the client and server in `finally`.

This uses MCP protocol operations without registering a persistent MCP server in
Claude Code and without letting the model select a tool.

### Main-session MCP removal

Delete the plugin-root `.mcp.json`. The built `dist/mcp-server.js` remains for:

- the temporary in-process MCP connection
- direct development or external MCP client testing

After this change, `/mcp` and plugin details should not list Vision Bridge as a
main-session MCP server.

## Argument Adapters

### `analyze_image`

The adapter:

- resolves `[Image #N]` as clipboard input
- accepts one local image path or URL from command arguments
- removes the source token and command token from the provider prompt
- infers OCR mode from the remaining natural-language question
- uses the configured MCP timeout and output limit

Clipboard reading and image capture continue to use the existing shared source
resolver and plugin data directory.

### `doctor_providers`

Accepts no arguments. Existing secret redaction remains unchanged.

### `clear_vision_cache`

Accepts one shorthand value:

```text
all | success | failure
```

The adapter converts it to `{ "kind": value }`.

### Future tools

Exact names are discovered through `tools/list`. If a future tool has no
friendly adapter, the remaining command text must be either empty or one JSON
object. The MCP server remains the source of truth for schema validation.

## Security And Failure Behavior

- No command argument is executed by a shell.
- The Hook parses Claude Code's JSON input and passes structured values to the
  MCP SDK.
- Tool lookup is restricted to names returned by the temporary server's
  `tools/list`.
- Provider API keys remain redacted in diagnostics.
- Invalid aliases fail plugin configuration validation.
- Missing pasted image data produces a clear clipboard/image error.
- Manual MCP failure never triggers automatic Hook analysis in the same turn.
- The temporary client and server are closed on success and failure.

## Tests

### Manifest and packaging

- `.mcp.json` is absent.
- Plugin declares the four alias options.
- `skills/mcp/SKILL.md` is manual-only.
- Hooks register both `UserPromptSubmit` and the namespaced
  `UserPromptExpansion` command.
- `dist/manual-mcp-command-handler.js` exists.

### Routing

- Ordinary pasted-image prompt runs automatic Hook analysis.
- Natural-language MCP discussion still runs the normal Hook path.
- Exact manual command prefix skips automatic Hook analysis.
- Other slash commands do not skip automatic analysis.

### Command parsing

- Default and configured aliases resolve correctly.
- Exact stable tool names always resolve.
- Duplicate or invalid aliases fail clearly.
- `clean` shorthand maps to the expected cache input.
- Future exact tool names accept an optional JSON object.
- Invalid JSON and unknown tools return usage errors.

### Manual image analysis

- Pasted image plus `analyze` becomes clipboard `analyze_image` input.
- Path and URL forms become the correct source types.
- OCR intent is inferred from Chinese and English text.
- No question uses the default image prompt.
- Multiple image sources are rejected.

### MCP lifecycle

- Each command performs `tools/list`.
- Tool commands perform one `tools/call`.
- `tools` performs no `tools/call`.
- Client and server close after success and failure.

### End-to-end verification

Use fresh Claude Code processes:

1. Paste an image with a normal question.
   - `UserPromptSubmit` analyzes once.
   - No Vision Bridge MCP tool is available to the model.
2. Run `/claude-vision-bridge:mcp analyze` with a pasted image.
   - Automatic analysis is skipped.
   - `UserPromptExpansion` performs one temporary MCP call.
   - The configured local provider handles the image.
3. Run `doctor`, `clean failure`, and `tools`.
4. Change one alias in `~/.claude/settings.json` and verify the new alias works
   while the exact MCP tool name remains valid.

Debug logs and transcripts must show one Vision Bridge path per turn.

## Non-Goals

- Exposing Vision Bridge MCP tools to the main model.
- Using `PreToolUse` guards or per-turn routing state.
- Inferring manual MCP intent from natural language.
- Adding friendly argument adapters for hypothetical future tools before they
  exist.
- Changing provider routing, URL security policy, cache semantics, or vision
  result normalization.
