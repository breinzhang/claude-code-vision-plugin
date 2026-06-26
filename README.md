# Claude Vision Bridge

Claude Vision Bridge is a Claude Code plugin that turns images into structured
text context before your prompt reaches the main model. It is designed for
Claude Code setups where the coding model does not accept image input directly,
or where you want image parsing to run through local OpenAI-compatible vision
models first.

The plugin is published through this repository as the
`brein-claude-tools` Claude Code marketplace.

## Features

- Automatic image analysis through a `UserPromptSubmit` Hook.
- Explicit manual command for MCP-style tool execution:
  `/claude-vision-bridge:mcp`.
- Local provider priority with OpenAI-compatible endpoints for Ollama, oMLX,
  and llama.cpp.
- Optional remote OpenAI-compatible fallback, disabled by default.
- Image source support for local paths, HTTPS URLs, pasted screenshot chips,
  clipboard captures, and MCP base64 payloads.
- Shared VisionService for Hook and manual command paths, covering source
  resolution, security policy, provider routing, caching, normalization, and
  failure artifacts.
- Deterministic routing: normal pasted images use the Hook path only; MCP runs
  only when the user explicitly enters the manual command.
- Provider diagnostics through `/claude-vision-bridge:mcp doctor` and the
  `cc-vision-doctor` CLI.
- Cache cleanup through `/claude-vision-bridge:mcp clean`.
- Security-first defaults for remote upload, HTTP URLs, private-network URLs,
  sensitive paths, symlink traversal, and prompt-injection style OCR text.

## How It Works

Normal image prompts follow this path:

```text
User prompt with image reference
  -> UserPromptSubmit Hook
  -> VisionService
  -> cache lookup
  -> local VLM provider
  -> optional remote fallback
  -> normalized Markdown context
  -> Claude Code main model
```

Manual MCP commands follow this path:

```text
/claude-vision-bridge:mcp ...
  -> UserPromptExpansion Hook
  -> temporary in-memory MCP client/server
  -> tools/list or tools/call
  -> command result injected as context
  -> Claude answers from the completed result
```

The plugin does not register a persistent Vision Bridge MCP server in the main
Claude conversation. This prevents the model from running a second image
analysis after the Hook has already completed one.

## Installation

Inside Claude Code:

```text
/plugin marketplace add breinzhang/claude-code-vision-plugin
/plugin install claude-vision-bridge@brein-claude-tools
/plugin enable claude-vision-bridge@brein-claude-tools
```

The plugin is disabled by default. Enable it after reviewing the provider and
security configuration.

## Manual Development Install

For a session-scoped load without installing from the marketplace:

```bash
git clone https://github.com/breinzhang/claude-code-vision-plugin.git
cd claude-code-vision-plugin/plugins/claude-vision-bridge
npm ci
npm run build
claude --plugin-dir .
```

`--plugin-dir` loads the plugin only for that Claude Code session. Use the
marketplace commands for persistent installation.

## Usage

### Automatic Hook

Submit a normal Claude Code prompt that contains an image reference:

```text
Please inspect ./screens/error.png
Please analyze https://example.com/screenshot.png
Please look at [Image #1]
```

On macOS, pasted screenshots are read from the current system clipboard image
and stored under `${CLAUDE_PLUGIN_DATA}/captures/` before analysis.

If image analysis fails, the Hook injects a visible failure artifact instead of
blocking your prompt. The main model sees what failed, which providers were
attempted, and what to try next.

### Manual MCP Command

Use the manual command only when you explicitly want the MCP tool path:

```text
/claude-vision-bridge:mcp analyze [Image #1] 图片中显示的是几点？
/claude-vision-bridge:mcp analyze ./screens/error.png 描述错误
/claude-vision-bridge:mcp doctor
/claude-vision-bridge:mcp clean failure
/claude-vision-bridge:mcp tools
```

`analyze` accepts exactly one image source: one pasted image chip, one local
path, or one URL. It does not require JSON.

The current MCP tool names are also stable command entrypoints:

```text
/claude-vision-bridge:mcp analyze_image [Image #1] 读取文字
/claude-vision-bridge:mcp doctor_providers
/claude-vision-bridge:mcp clear_vision_cache success
```

Future tools returned by the `tools` command can be called by exact name with
an optional JSON object:

```text
/claude-vision-bridge:mcp future_tool {"option":"value"}
```

## Provider Configuration

The plugin calls already-running OpenAI-compatible vision endpoints. It does
not install models or start provider services.

Default provider settings:

| Provider | Base URL | Model |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434/v1` | `llava` |
| oMLX | `http://127.0.0.1:8000/v1` | `mlx-vlm` |
| llama.cpp | `http://127.0.0.1:8080/v1` | `llava` |
| Remote OpenAI-compatible | user configured | user configured |

Sensitive API key options are available for all providers:
`ollama_api_key`, `omlx_api_key`, `llama_cpp_api_key`, and
`remote_openai_api_key`.

Remote fallback is controlled by `allow_remote_fallback` and is disabled by
default.

## Configuration Options

Configure the installed plugin in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "claude-vision-bridge@brein-claude-tools": {
      "options": {
        "provider_order": "ollama,omlx,llama_cpp,remote_openai",
        "ollama_base_url": "http://127.0.0.1:11434/v1",
        "ollama_model": "llava",
        "ollama_api_key": "",
        "omlx_base_url": "http://127.0.0.1:8000/v1",
        "omlx_model": "mlx-vlm",
        "omlx_api_key": "",
        "llama_cpp_base_url": "http://127.0.0.1:8080/v1",
        "llama_cpp_model": "llava",
        "llama_cpp_api_key": "",
        "remote_openai_base_url": "",
        "remote_openai_model": "",
        "remote_openai_api_key": "",
        "allow_remote_fallback": false,
        "allow_http_urls": false,
        "allow_private_network_urls": false,
        "allowed_directories": "",
        "denied_directories": "",
        "max_image_bytes": 10485760,
        "hook_timeout_ms": 30000,
        "provider_timeout_ms": 20000,
        "mcp_timeout_ms": 60000,
        "max_output_chars": 8000,
        "mcp_analyze_command": "analyze",
        "mcp_doctor_command": "doctor",
        "mcp_clean_command": "clean",
        "mcp_tools_command": "tools"
      }
    }
  }
}
```

The four short manual subcommands are configurable. The fixed command name
`/claude-vision-bridge:mcp` is not configurable.

Configuration reference:

| Option | Purpose |
| --- | --- |
| `provider_order` | Comma-separated provider priority. Values: `ollama`, `omlx`, `llama_cpp`, `remote_openai`. |
| `ollama_base_url`, `ollama_model`, `ollama_api_key` | Ollama OpenAI-compatible endpoint configuration. |
| `omlx_base_url`, `omlx_model`, `omlx_api_key` | oMLX OpenAI-compatible endpoint configuration. |
| `llama_cpp_base_url`, `llama_cpp_model`, `llama_cpp_api_key` | llama.cpp OpenAI-compatible endpoint configuration. |
| `remote_openai_base_url`, `remote_openai_model`, `remote_openai_api_key` | Remote OpenAI-compatible fallback endpoint configuration. |
| `allow_remote_fallback` | Allows upload to the remote provider after local providers fail. |
| `allow_http_urls` | Allows non-HTTPS image URLs. |
| `allow_private_network_urls` | Allows private-network, localhost, loopback, and link-local image URLs. |
| `allowed_directories` | Comma-separated extra directories that local image paths may be read from. |
| `denied_directories` | Comma-separated extra directories that local image paths may not be read from. |
| `max_image_bytes` | Maximum image size accepted by Hook and manual MCP command paths. |
| `hook_timeout_ms` | Internal automatic Hook analysis budget. |
| `provider_timeout_ms` | Per-provider HTTP request timeout. |
| `mcp_timeout_ms` | Manual command `analyze_image` timeout. |
| `max_output_chars` | Maximum Markdown characters injected or returned. |
| `mcp_analyze_command`, `mcp_doctor_command`, `mcp_clean_command`, `mcp_tools_command` | Short manual subcommand aliases. |

## Security Defaults

- Remote fallback is disabled by default.
- Non-HTTPS image URLs are disabled by default.
- Private network, loopback, link-local, local/internal hostnames, and reserved
  network URLs are denied by default.
- System directories and sensitive paths are denied, including `.git`, `.ssh`,
  `.env*`, `*.pem`, `*.key`, `node_modules`, `dist`, and `build`.
- Paths are checked after `realpath`, so symlinks cannot bypass the path policy.
- API keys are redacted from diagnostic output.
- OCR text that looks like instructions is rendered as untrusted image content,
  not as recommended actions.

## Runtime Data

Runtime data is stored under `${CLAUDE_PLUGIN_DATA}`:

```text
cache/success/
cache/failure/
cache/locks/
captures/
```

Success cache entries are keyed by image bytes, request mode, prompt, provider
order, remote fallback policy, and schema version. Failure cache entries use a
short TTL so transient provider issues can recover.

## Diagnostics

From Claude Code:

```text
/claude-vision-bridge:mcp doctor
/claude-vision-bridge:mcp tools
```

From a shell after building or installing the package:

```bash
cc-vision-doctor
```

The doctor output checks provider configuration and health while redacting
sensitive values.

## Development

Requirements:

- Node.js 20 or newer
- Claude Code
- At least one running OpenAI-compatible vision endpoint for live image analysis

Common commands:

```bash
cd plugins/claude-vision-bridge
npm ci
npm test
npm run typecheck
npm run build
```

Validate the plugin manifest:

```bash
claude plugin validate plugins/claude-vision-bridge --strict
```

Repository layout:

```text
.claude-plugin/marketplace.json
plugins/claude-vision-bridge/.claude-plugin/plugin.json
plugins/claude-vision-bridge/hooks/hooks.json
plugins/claude-vision-bridge/skills/mcp/SKILL.md
plugins/claude-vision-bridge/src/
plugins/claude-vision-bridge/test/
```

## License

MIT. See [LICENSE](LICENSE).
