# Changelog

## 0.1.5 - 2026-06-16

- Render Hook success output as explicit image pixel evidence so Claude uses local VLM OCR/vision results instead of treating them as ordinary commentary.
- Infer OCR mode from Hook prompts that ask for OCR or visible text extraction.
- Tell OpenAI-compatible providers to prioritize visible text when the user asks for OCR.

## 0.1.4 - 2026-06-16

- Mark Hook success output as completed pre-analysis so the main model should answer from it instead of repeating image tool calls.

## 0.1.3 - 2026-06-16

- Include the analysis pipeline version in cache keys so prompt fixes do not reuse stale success cache entries.

## 0.1.2 - 2026-06-16

- Add a provider prompt wrapper that tells OpenAI-compatible VLMs the image is already attached, preventing local models from refusing path-style prompts.

## 0.1.1 - 2026-06-16

- Normalize `provider_order` values before validation so plugin configuration accepts casing like `oMLX`.
- Add optional API key configuration for local OpenAI-compatible providers and send it during provider health checks.

## 0.1.0 - 2026-06-14

- Initial Claude Vision Bridge plugin release under the MIT license.
- Adds `UserPromptSubmit` Hook vision context injection.
- Adds MCP tools: `analyze_image`, `doctor_providers`, and `clear_vision_cache`.
- Supports local path, URL, clipboard, and MCP base64 image sources.
- Shares one VisionService across Hook and MCP for source resolution, security policy, cache, provider routing, normalization, and failure artifacts.
- Supports local OpenAI-compatible VLM endpoints and optional OpenAI-compatible remote fallback.
- Defaults remote fallback, HTTP URLs, and private network URLs to disabled.
