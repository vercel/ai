---
'@ai-sdk/harness-pi': patch
---

feat(harness-pi): serve mcpServers with Pi's native MCP and tool_search

`mcpServers` is now served by Pi's built-in MCP extension and its `tool_search` tool instead of `pi-mcp-adapter`, which is no longer a dependency. Each entry is Pi's `McpServerConfig`: stdio `{ command, args, env, cwd }` or streamable HTTP `{ url, headers, timeout }`, plus `exposure`, `toolExposure`, `enabled` and `description`. Fields that only the adapter understood, such as `lifecycle`, no longer compile.

Tool names are always `mcp__<server>__<tool>`, with `-` in either name replaced by `_`, so a server named `brand-ai` now yields `mcp__brand_ai__<tool>`. `exposure` defaults to `direct`, which declares a server's tools to the model. `deferred` tools stay undeclared until the model loads them through `tool_search` and then calls them by name. Pi's own default, `codemode`, is not accepted because the harness does not load Pi's codemode extension.

`mcpSettings.toolPrefix` and `mcpSettings.outputGuard` are deprecated. A `toolPrefix` other than `'mcp'` or `outputGuard: false` now fails session start, since native MCP cannot honor either. Pi truncates text results over 20 KB and writes the full text to a file in the host temp directory.

The harness has no sign-in flow, so an HTTP server must carry an `Authorization` header or `auth.provider`; with the header, OAuth never runs. The harness reads no `mcp.json` and writes no `mcp.log` or `mcp-auth.json`. `@earendil-works/pi-ai` is no longer a direct dependency.
