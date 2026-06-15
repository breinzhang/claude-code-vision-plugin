# Claude Vision Bridge Design Spec

日期：2026-06-14  
状态：已完成 brainstorming 设计确认，等待用户 review  
目标：实现一个可发布的 Claude Code Plugin，为接入第三方无视觉能力主模型的 Claude Code 工作流提供视觉 Sidecar 能力。

## 1. 范围与目标

本项目要交付一个完整可发布版本，不是本地 MVP。插件名称为 `claude-vision-bridge`，发布在 GitHub 仓库里的第三方 Claude Code marketplace 中，并保留手动安装方式。

核心目标：

- 通过 `UserPromptSubmit` Hook 自动识别图片来源，生成视觉分析上下文并注入 `additionalContext`。
- 通过 MCP 提供显式工具调用，至少包含 `analyze_image`、`doctor_providers`、`clear_vision_cache`。
- 为不支持视觉输入的主模型提供结构化文本视觉上下文。
- 默认本地 VLM 优先，远程 OpenAI-compatible vision API 可选回退。
- 失败必须可见，不能静默跳过。
- 最新 Claude Code 为唯一兼容目标，不做旧版本兼容。

非目标：

- 插件不安装、下载、启动或管理 Ollama、oMLX、llama.cpp 等本地模型服务。
- 插件不把图片直接交给 Claude Code 主模型链路。
- 插件不默认启用远程回退。
- 插件不支持旧版 Claude Code 的降级 manifest 或 Hook 行为。

## 2. 官方接口依据

本设计依赖以下 Claude Code 官方能力：

- Plugin 支持 `.claude-plugin/plugin.json`、`hooks/hooks.json`、`.mcp.json`。
- Marketplace 支持 GitHub `owner/repo` 添加方式，并从 `.claude-plugin/marketplace.json` 读取插件目录。
- `UserPromptSubmit` Hook 在用户 prompt 进入模型前触发，Hook 输入包含 `prompt` 文本字段。
- Hook 可以通过 `hookSpecificOutput.additionalContext` 注入模型可见上下文。
- Plugin `userConfig` 支持配置项、默认值和 `sensitive` 存储。
- `${CLAUDE_PLUGIN_ROOT}` 指向插件安装目录，`${CLAUDE_PLUGIN_DATA}` 指向持久数据目录。

参考文档：

- https://code.claude.com/docs/en/hooks.md
- https://code.claude.com/docs/en/plugins.md
- https://code.claude.com/docs/en/plugins-reference.md
- https://code.claude.com/docs/en/plugin-marketplaces.md
- https://code.claude.com/docs/en/discover-plugins.md

## 3. 仓库与插件结构

仓库根目录是 marketplace，实际插件放在子目录。

```text
claude-code-vision-plugin/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── claude-vision-bridge/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── hooks/
│       │   └── hooks.json
│       ├── .mcp.json
│       ├── bin/
│       │   └── cc-vision-doctor
│       ├── src/
│       │   ├── hook/
│       │   ├── mcp/
│       │   ├── core/
│       │   ├── sources/
│       │   ├── security/
│       │   ├── cache/
│       │   ├── router/
│       │   ├── providers/
│       │   ├── normalize/
│       │   ├── failure/
│       │   ├── logging/
│       │   └── config/
│       ├── test/
│       ├── package.json
│       ├── tsconfig.json
│       ├── README.md
│       ├── CHANGELOG.md
│       └── LICENSE
└── README.md
```

License 使用 MIT：

- 仓库和插件目录都应清楚声明 MIT。
- 插件 `plugin.json` 的 `license` 字段设置为 `MIT`。
- 发布验收必须检查 `LICENSE` 文件存在。

## 4. 架构边界

采用双入口薄适配加单核心库。

```text
Hook Handler
  -> Hook 输入/输出适配
  -> Vision Core

MCP Server
  -> MCP tool 参数/返回适配
  -> Vision Core
```

Hook 和 MCP 的重叠能力全部复用同一套核心代码。共享核心包含：

- `ImageSourceResolver`
- `PathPolicy`
- `UrlPolicy`
- `ClipboardImageSourceResolver`
- `CacheManager`
- `VisionRouter`
- `ProviderAdapters`
- `Normalizer`
- `FailureArtifact`
- `AuditLogger`

不共享的是入口协议：

- Hook 读 stdin，输出 Claude Code Hook JSON，注入 `additionalContext`，超时预算更短。
- MCP 使用 stdio JSON-RPC，返回 `content` 和 `structuredContent`，可暴露更丰富的结构化结果。

核心调用链：

```text
AnalyzeImageRequest
  -> ImageSourceResolver
  -> SourcePolicy
  -> CacheManager
  -> VisionRouter
  -> ProviderAdapter
  -> Normalizer
  -> FailureArtifact
  -> AuditLogger
```

这样做的理由：

- 避免 Hook 和 MCP 的路径策略、URL SSRF 防护、缓存 key、Provider 回退行为漂移。
- 让同一张图片通过 Hook 或 MCP 分析后能共享缓存。
- 让安全和对抗测试集中在核心服务上。
- 新增 Provider 或修复 Normalizer 时只改一处。

## 5. 图片来源

统一定义 `ImageSource`：

```ts
type ImageSource =
  | { type: 'path'; path: string; origin: 'hook' | 'mcp' }
  | { type: 'url'; url: string; origin: 'hook' | 'mcp' }
  | { type: 'clipboard'; origin: 'hook' | 'mcp' }
  | { type: 'base64'; mime: string; data: string; origin: 'mcp' };
```

入口支持矩阵：

| 来源 | Hook | MCP |
|---|---:|---:|
| 本地图片路径 | 支持 | 支持 |
| 图片 URL | 支持 | 支持 |
| 系统剪贴板图片 | 支持 | 支持 |
| base64 图片 | 不支持 | 支持 |

Hook 从 prompt 文本中提取：

- 本地图片路径。
- 图片 URL。
- `[Image #N]` 或类似图片 chip 线索。

Hook 不假设 Claude Code Hook stdin 一定暴露附件二进制。检测到图片 chip 时，调用系统剪贴板 resolver 读取当前剪贴板图片。若剪贴板已变化或不可读，则生成 `FailureArtifact`。

MCP 通过 tool 参数显式指定来源。

## 6. 路径安全策略

默认允许：

- 当前 Claude Code 项目目录。
- 当前用户 home 目录下的图片路径，包括 Desktop、Downloads、Documents 等。
- 用户显式配置的 `allowed_directories`。

默认拒绝：

- macOS/Linux 系统目录：`/System`、`/Library`、`/bin`、`/sbin`、`/usr`、`/etc`、`/var`、`/private`、`/opt`。
- Windows 系统目录：`C:\Windows`、`C:\Program Files`、`C:\Program Files (x86)`、`C:\ProgramData`。
- 所有平台敏感路径或构建依赖目录：`.git`、`.ssh`、`.env`、`.env.*`、`*.pem`、`*.key`、`node_modules`、`dist`、`build`。
- 用户显式配置的 `denied_directories` 和 `denied_globs`。

所有路径必须：

1. 解析为绝对路径。
2. 执行 `realpath`。
3. 按最终目标路径做 allow/deny 判断。
4. 校验文件存在。
5. 校验扩展名。
6. 校验 MIME。
7. 校验大小。

符号链接不能绕过路径策略。home 目录下的 symlink 如果指向系统目录或敏感目录，必须拒绝。

默认图片格式：

```text
.png .jpg .jpeg .webp .gif .bmp .svg
```

默认文件大小上限：10 MB，可配置。

## 7. URL 安全策略

Hook 和 MCP 都支持 URL 图片分析，但默认策略保守：

- 默认只允许 `https://`。
- 默认拒绝 `http://`、`file://`、`data:`、`ftp:`。
- 默认拒绝 localhost、loopback、私有网段、链路本地地址和内网 DNS 解析结果。
- 默认拒绝响应 MIME 不是图片的 URL。
- 限制重定向次数。
- 限制下载大小。
- 限制下载超时。

配置项可以显式允许：

- `allow_http_urls`
- `allow_private_network_urls`

即使开启这些配置，URL 下载后仍必须通过 MIME、大小、缓存 schema 和安全审计。URL 下载后的缓存 key 基于 bytes hash，而不是仅基于 URL 字符串。

## 8. Clipboard 策略

Hook 和 MCP 统一使用 `ClipboardImageSourceResolver`。

处理流程：

```text
read system clipboard image bytes
  -> if no image: FailureArtifact
  -> detect mime/ext
  -> compute sha256
  -> if direct data-url provider input works: pass bytes/data-url
  -> also save or reuse captures/<sha256>.<ext> when needed
  -> continue through cache/router/provider
```

落盘目录：

```text
${CLAUDE_PLUGIN_DATA}/captures/<sha256>.<ext>
```

要求：

- 不写入项目目录。
- macOS 第一版优先支持。
- Windows/Linux 可 best-effort；平台不可用时返回 `CLIPBOARD_UNAVAILABLE`。
- 剪贴板为空或不是图片时返回 `CLIPBOARD_EMPTY`。
- 读取失败不能阻断 Hook。

## 9. Provider 路由

所有 Provider 第一版都走 OpenAI-compatible `/v1/chat/completions` vision 格式。

插件不管理模型服务生命周期，只调用已运行服务。

默认顺序：

```text
ollama -> omlx -> llama_cpp -> remote_openai
```

默认 endpoint：

```text
ollama:     http://127.0.0.1:11434/v1
omlx:       http://127.0.0.1:8000/v1
llama_cpp:  http://127.0.0.1:8080/v1
remote:     user-configured
```

远程回退：

- 默认关闭。
- 只有 `allow_remote_fallback=true` 时启用。
- 只支持 OpenAI-compatible vision chat completions。
- 远程 API key 使用 `sensitive: true`。
- API key 不得出现在日志、artifact、doctor 输出中。

Provider 调用必须有超时、错误分类、输出大小限制和 malformed response 检查。

`doctor_providers` 必须能显示：

- 插件版本。
- provider order。
- 每个 provider 的 base URL。
- model 是否配置。
- health check 状态。
- 远程回退是否开启。
- 最近错误分类。
- 熔断状态。
- 缓存和 captures 目录是否可写。

## 10. 缓存设计

缓存目录：

```text
${CLAUDE_PLUGIN_DATA}/
  cache/
    success/<key>.json
    success/<key>.md
    failure/<key>.json
    failure/<key>.md
    locks/<key>.lock
  captures/<sha256>.<ext>
  logs/audit.jsonl
  logs/error.jsonl
  metrics/counters.json
```

成功缓存 key 包含：

- 图片 bytes sha256。
- mode。
- provider id。
- model。
- prompt template version。
- normalizer schema version。
- redaction/security policy version。

失败缓存 key 包含：

- 图片 bytes sha256，或路径/URL/clipboard source signature。
- mode。
- provider order。
- remote fallback policy。
- failure category。
- config fingerprint。

失败缓存 TTL：

| 失败类型 | TTL |
|---|---:|
| path/url/source policy denied | 24h |
| local providers failed | 2min |
| remote failed | 2min |
| clipboard empty/unavailable | 30s |
| internal error | 30s |

并发策略：

- 同一 key 使用 lock。
- 读缓存必须 schema 校验。
- 写缓存使用 tmp file -> fsync -> rename。
- 损坏缓存忽略并重算。
- success cache 和 failure cache 目录隔离，并且 artifactType 必须匹配目录。

## 11. Artifact 与输出标准化

成功返回 `VisionArtifact`：

```ts
interface VisionArtifact {
  artifactType: 'success';
  schemaVersion: 'vision-artifact.v1';
  source: {
    type: 'path' | 'url' | 'clipboard' | 'base64';
    originalRef: string;
    resolvedPath?: string;
    sha256: string;
    mime: string;
    bytes: number;
  };
  provider: {
    id: 'ollama' | 'omlx' | 'llama_cpp' | 'remote_openai';
    model: string;
    endpoint?: string;
    fallbackDepth: number;
  };
  timings: {
    startedAt: string;
    completedAt: string;
    latencyMs: number;
    cacheHit: boolean;
  };
  analysis: VisionStructuredOutput;
  markdown: string;
}
```

失败返回 `FailureArtifact`：

```ts
interface FailureArtifact {
  artifactType: 'failure';
  schemaVersion: 'vision-failure.v1';
  source?: {
    type: 'path' | 'url' | 'clipboard' | 'base64';
    originalRef: string;
    resolvedPath?: string;
    sha256?: string;
  };
  failure: {
    category: FailureCategory;
    message: string;
    attemptedProviders: Array<{
      id: string;
      status: 'skipped' | 'failed' | 'timeout' | 'circuit_open';
      reason: string;
    }>;
    remoteFallbackAllowed: boolean;
  };
  recommendedNextSteps: string[];
  markdown: string;
}
```

失败分类：

```text
NO_VALID_IMAGE
PATH_POLICY_DENIED
URL_POLICY_DENIED
CLIPBOARD_UNAVAILABLE
CLIPBOARD_EMPTY
INVALID_BASE64
LOCAL_PROVIDERS_FAILED
REMOTE_DISABLED
REMOTE_FAILED
PROVIDER_TIMEOUT
MALFORMED_RESPONSE
INTERNAL_ERROR
```

Markdown 注入规则：

- 默认不超过 8 KB。
- 包含 source、provider、observations、OCR、recommended searches。
- 明确标注不确定性和模型限制。
- OCR 中出现系统指令、shell 指令、删除文件、导出密钥等内容时，必须标记为 untrusted data，不能变成 recommended actions。

## 12. Hook 设计

`hooks/hooks.json`：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/hook-handler.js"],
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Hook 行为：

- 无图片来源：exit 0，无 stdout。
- 图片分析成功：exit 0，输出 Hook JSON，注入 `additionalContext`。
- 来源策略拒绝或 Provider 失败：exit 0，注入 FailureArtifact。
- 内部异常：exit 0，注入最小 FailureArtifact。
- 不使用 exit 2 阻断用户 prompt。
- stdout 只输出合法 Hook JSON。
- 日志写 stderr 或文件。

Hook 输出：

```json
{
  "suppressOutput": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "## Vision Analysis\n\n### Summary\nA screenshot is available as structured vision context."
  }
}
```

## 13. MCP 设计

`.mcp.json`：

```json
{
  "mcpServers": {
    "vision-bridge": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js"],
      "env": {
        "CLAUDE_VISION_PLUGIN_DATA": "${CLAUDE_PLUGIN_DATA}"
      }
    }
  }
}
```

MCP tools：

```text
analyze_image
doctor_providers
clear_vision_cache
```

`analyze_image` input：

```ts
{
  source:
    | { type: 'path'; path: string }
    | { type: 'url'; url: string }
    | { type: 'clipboard' }
    | { type: 'base64'; mime: string; data: string };
  mode?: 'general' | 'ui' | 'ocr' | 'error' | 'chart' | 'document-screenshot';
  prompt?: string;
  preferredProvider?: 'ollama' | 'omlx' | 'llama_cpp' | 'remote_openai';
  preferredModel?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}
```

`analyze_image` output：

- `content`: Markdown text for Claude.
- `structuredContent`: `VisionArtifact` or `FailureArtifact`.

业务失败不抛 MCP 协议异常；只有参数 schema 非法才返回参数错误。

`doctor_providers` 不得泄露 API key。

`clear_vision_cache` 支持：

- `all`
- `success`
- `failure`
- `sourceHash`

默认不删除 captures，只有 `includeCaptures=true` 时删除。

## 14. 配置设计

`plugin.json` 使用 `userConfig` 暴露配置。核心默认值：

- `defaultEnabled=false`
- `allow_remote_fallback=false`
- `allow_http_urls=false`
- `allow_private_network_urls=false`
- `max_image_bytes=10485760`
- `hook_timeout_ms=30000`
- `provider_timeout_ms=20000`
- `mcp_timeout_ms=60000`
- `max_output_chars=8000`

配置分组：

Provider：

- `provider_order`
- `ollama_base_url`
- `ollama_model`
- `omlx_base_url`
- `omlx_model`
- `llama_cpp_base_url`
- `llama_cpp_model`
- `remote_openai_base_url`
- `remote_openai_api_key`
- `remote_openai_model`

Policy：

- `allow_remote_fallback`
- `allow_http_urls`
- `allow_private_network_urls`
- `allowed_directories`
- `denied_directories`
- `max_image_bytes`

Runtime：

- `hook_timeout_ms`
- `provider_timeout_ms`
- `mcp_timeout_ms`
- `max_output_chars`
- `failure_cache_ttl_seconds`

Sensitive：

- `remote_openai_api_key` 必须 `sensitive: true`。

## 15. 发布与安装

Marketplace manifest：

```json
{
  "name": "brein-claude-tools",
  "owner": {
    "name": "brein"
  },
  "plugins": [
    {
      "name": "claude-vision-bridge",
      "source": "./plugins/claude-vision-bridge",
      "description": "Vision bridge for Claude Code with local VLM providers and optional remote fallback.",
      "category": "developer-tools",
      "tags": ["vision", "vlm", "mcp", "hooks"]
    }
  ]
}
```

用户安装：

```text
/plugin marketplace add breinzhang/claude-code-vision-plugin
/plugin install claude-vision-bridge@brein-claude-tools
/plugin enable claude-vision-bridge@brein-claude-tools
```

手动本地安装：

```bash
cd plugins/claude-vision-bridge
npm ci
npm run build
claude --plugin-dir .
```

从 marketplace 根目录测试：

```bash
claude plugin validate . --strict
claude plugin validate ./plugins/claude-vision-bridge --strict
claude --plugin-dir ./plugins/claude-vision-bridge
```

zip 手动安装：

```bash
cd plugins
zip -r claude-vision-bridge.zip claude-vision-bridge \
  -x "claude-vision-bridge/node_modules/*" \
  -x "claude-vision-bridge/src/*" \
  -x "claude-vision-bridge/test/*"

claude --plugin-dir ./claude-vision-bridge.zip
```

版本策略：

- 发布版使用 `plugin.json` 显式 SemVer，例如 `0.1.0`。
- 用户需要收到更新时必须 bump version。
- marketplace entry 不重复写 version，避免与 `plugin.json` 冲突。
- `CHANGELOG.md` 同步记录版本变化。

## 16. 测试与验收

核心单元测试：

- path / URL / clipboard / base64 source resolver。
- path policy：home allow、system deny、symlink deny、sensitive deny。
- URL policy：https allow、http deny、localhost deny、private network deny、redirect-to-private deny。
- cache：hit/miss、success/failure 分离、TTL、损坏缓存、原子写入。
- router：本地优先、远程关闭不调用、本地全失败后远程。
- providers：success、timeout、500、401、429、malformed response、oversized response。
- normalizer：schema、markdown、prompt injection guard。
- failure artifact：每个失败分类 snapshot。

入口集成测试：

- Hook 无图片 prompt 不输出。
- Hook path / URL / clipboard 成功注入。
- Hook provider 全失败注入 FailureArtifact。
- Hook 非法输入和内部异常 exit 0 fail-open。
- Hook stdout 只输出合法 JSON。
- MCP analyze_image 支持 path / URL / clipboard / base64。
- MCP doctor_providers 不泄露 API key。
- MCP clear_vision_cache 正确清理。
- MCP stdout 只输出 JSON-RPC。

对抗测试：

- 路径穿越。
- symlink 指向系统目录。
- URL 重定向到内网。
- DNS rebinding 模拟。
- 超大响应。
- Provider 返回伪 system prompt。
- Provider 错误中包含 API key。
- cache poisoning。
- 20 并发同一图片。
- clipboard 读取失败。

发布门禁：

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
claude plugin validate . --strict
claude plugin validate ./plugins/claude-vision-bridge --strict
```

No-Go 条件：

- Hook 可能阻断主会话。
- Hook stdout 或 MCP stdout 污染。
- 远程回退默认开启。
- 远程回退关闭时发生远程 Provider 请求。
- URL SSRF 成功。
- 系统目录或敏感文件可被读取。
- API key 明文进入日志、artifact、doctor 输出。
- FailureArtifact 缺失。
- 缓存污染测试失败。
- marketplace 或 plugin validate 失败。

## 17. README 要求

README 必须包含：

- Marketplace 安装步骤。
- 手动 `--plugin-dir` 安装步骤。
- zip 安装步骤。
- 如何启用插件。
- 如何配置 Ollama、oMLX、llama.cpp。
- 如何开启远程回退。
- Hook 用法示例：本地路径、URL、剪贴板截图。
- MCP 用法示例：path、URL、clipboard、base64。
- 安全说明：URL SSRF、剪贴板、远程上传默认关闭。
- `doctor_providers` 故障排查说明。
- MIT License 声明。

## 18. 自检结论

本 spec 聚焦一个可发布插件，范围包含 Hook、MCP、Provider、缓存、安全、发布与测试门禁。当前没有未解决的设计空洞。进入 implementation plan 前，用户需要 review 本文件并确认是否需要调整。
