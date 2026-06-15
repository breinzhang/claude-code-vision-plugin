# Claude Vision Bridge

Claude Vision Bridge adds structured vision context to Claude Code when your main model does not support image input.

It provides both:

- a `UserPromptSubmit` Hook that injects image analysis as `additionalContext`
- an MCP server with `analyze_image`, `doctor_providers`, and `clear_vision_cache`

The Hook and MCP entrypoints share one VisionService for source resolution, security policy, cache, provider routing, normalization, and failure artifacts.

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

## MCP Usage

`analyze_image` supports local paths, URLs, clipboard images, and base64 image input:

```json
{ "source": { "type": "path", "path": "./screens/error.png" } }
```

```json
{ "source": { "type": "url", "url": "https://example.com/screenshot.png" } }
```

```json
{ "source": { "type": "clipboard" } }
```

```json
{
  "source": {
    "type": "base64",
    "mime": "image/png",
    "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
  }
}
```

Other tools:

- `doctor_providers`: prints provider and runtime diagnostics with secrets redacted.
- `clear_vision_cache`: clears `all`, `success`, or `failure` cache entries.

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

Through MCP, call:

```text
doctor_providers
```

Or run the built CLI:

```bash
cc-vision-doctor
```

## License

MIT
