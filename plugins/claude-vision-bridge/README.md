# Claude Vision Bridge

Claude Vision Bridge adds structured vision context to Claude Code when your main model does not support image input.

It provides:

- a `UserPromptSubmit` Hook that injects image analysis as `additionalContext`
- a user-only `/claude-vision-bridge:mcp` command for explicit MCP execution

The automatic Hook and manual MCP command share one VisionService for source resolution, security policy, cache, provider routing, normalization, and failure artifacts.

## Install From Marketplace

Inside Claude Code:

```text
/plugin marketplace add breinzhang/claude-code-vision-plugin
/plugin install claude-vision-bridge@brein-claude-tools
/plugin enable claude-vision-bridge@brein-claude-tools
```

The plugin is disabled by default. Enable it only after reviewing its configuration.

## Manual Install

For a manual, session-scoped load without adding the marketplace:

```bash
git clone https://github.com/breinzhang/claude-code-vision-plugin.git
cd claude-code-vision-plugin/plugins/claude-vision-bridge
npm ci
npm run build
claude --plugin-dir .
```

`--plugin-dir` loads the plugin for that Claude Code session. Use the marketplace install for persistent user/project installation.

From an already-cloned repository:

```bash
cd plugins/claude-vision-bridge
npm ci
npm run build
claude --plugin-dir .
```

Zip install:

```bash
cd plugins
zip -r claude-vision-bridge.zip claude-vision-bridge \
  -x "claude-vision-bridge/node_modules/*" \
  -x "claude-vision-bridge/src/*" \
  -x "claude-vision-bridge/test/*"
claude --plugin-dir ./claude-vision-bridge.zip
```

## Provider Configuration

The plugin calls already-running OpenAI-compatible vision endpoints. It does not install models or start provider services.

Defaults:

- Ollama: `http://127.0.0.1:11434/v1`, model `llava`
- oMLX: `http://127.0.0.1:8000/v1`, model `mlx-vlm`
- llama.cpp: `http://127.0.0.1:8080/v1`, model `llava`
- Remote OpenAI-compatible endpoint: user configured, disabled by default

If a local endpoint requires authentication, configure the matching sensitive
key option: `ollama_api_key`, `omlx_api_key`, or `llama_cpp_api_key`.

Remote fallback must be explicitly enabled with `allow_remote_fallback`.

## Hook Usage

Submit prompts containing a local image path, image URL, or pasted screenshot chip:

```text
Please inspect ./screens/error.png
Please analyze https://example.com/screenshot.png
Please look at [Image #1]
```

For pasted screenshots on macOS, the Hook reads the current system clipboard image and stores the captured bytes under `${CLAUDE_PLUGIN_DATA}/captures/`.

If analysis fails, the Hook injects a visible `FailureArtifact` and does not block the prompt.

Normal pasted images use this Hook path only. The Hook skips automatic analysis
only when the prompt starts with the exact manual command described below.

## Manual MCP Command

MCP tools are intentionally absent from the main Claude conversation and from
`/mcp`. They run only when you explicitly enter:

```text
/claude-vision-bridge:mcp analyze [Image #1] 图片中显示的是几点？
/claude-vision-bridge:mcp analyze ./screens/error.png 描述错误
/claude-vision-bridge:mcp doctor
/claude-vision-bridge:mcp clean failure
/claude-vision-bridge:mcp tools
```

`analyze` must be present before the pasted image, path, or URL. It accepts
exactly one image source and does not require JSON.

The exact current MCP tool names remain stable command entrypoints:

```text
/claude-vision-bridge:mcp analyze_image [Image #1] 读取文字
/claude-vision-bridge:mcp doctor_providers
/claude-vision-bridge:mcp clear_vision_cache success
```

Future tools returned by the `tools` command can be called by exact name with an
optional JSON object:

```text
/claude-vision-bridge:mcp future_tool {"option":"value"}
```

The four short aliases are configurable in `~/.claude/settings.json`:

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

The fixed `/claude-vision-bridge:mcp` command name is not configurable.

## Security Defaults

- Remote fallback is disabled by default.
- HTTP image URLs are disabled by default.
- Private network, loopback, link-local, local/internal hostnames, and reserved network URLs are denied by default.
- System directories and sensitive paths are denied, including `.git`, `.ssh`, `.env*`, `*.pem`, `*.key`, `node_modules`, `dist`, and `build`.
- Paths are checked after `realpath`, so symlinks cannot bypass the policy.
- API keys are sensitive configuration values and are redacted from doctor output.
- OCR text that looks like instructions is rendered as untrusted data, not as recommended actions.

## Cache And Captures

Runtime data is stored under `${CLAUDE_PLUGIN_DATA}`:

```text
cache/success/
cache/failure/
cache/locks/
captures/
```

Success cache entries are keyed by image bytes, request mode, prompt, provider order, remote fallback policy, and schema version. Failure entries use a short TTL.

## Diagnostics

Run the manual command:

```text
/claude-vision-bridge:mcp doctor
```

Or run the built CLI:

```bash
cc-vision-doctor
```

## License

MIT
