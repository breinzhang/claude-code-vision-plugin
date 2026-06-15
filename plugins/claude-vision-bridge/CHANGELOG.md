# Changelog

## 0.1.0 - 2026-06-14

- Initial Claude Vision Bridge plugin release under the MIT license.
- Adds `UserPromptSubmit` Hook vision context injection.
- Adds MCP tools: `analyze_image`, `doctor_providers`, and `clear_vision_cache`.
- Supports local path, URL, clipboard, and MCP base64 image sources.
- Shares one VisionService across Hook and MCP for source resolution, security policy, cache, provider routing, normalization, and failure artifacts.
- Supports local OpenAI-compatible VLM endpoints and optional OpenAI-compatible remote fallback.
- Defaults remote fallback, HTTP URLs, and private network URLs to disabled.
