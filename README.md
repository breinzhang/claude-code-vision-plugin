# Claude Code Vision Plugin Marketplace

This repository hosts the `brein-claude-tools` Claude Code plugin marketplace.

## Install

Inside Claude Code:

```text
/plugin marketplace add breinzhang/claude-code-vision-plugin
/plugin install claude-vision-bridge@brein-claude-tools
/plugin enable claude-vision-bridge@brein-claude-tools
```

## Manual Install

For a manual, session-scoped load without adding the marketplace:

```bash
git clone https://github.com/breinzhang/claude-code-vision-plugin.git
cd claude-code-vision-plugin/plugins/claude-vision-bridge
npm ci
npm run build
claude --plugin-dir .
```

`--plugin-dir` loads the plugin for that Claude Code session. Use the marketplace
commands above for persistent user/project installation.

## Plugins

- `claude-vision-bridge`: Adds vision analysis context to Claude Code through Hook and MCP entrypoints.

## License

MIT
