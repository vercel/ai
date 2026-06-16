---
'@ai-sdk/react': patch
---

fix(react): deny MCP App tool calls by default when allowedTools is omitted

`experimental_MCPAppRenderer`'s bridge only enforced the `allowedTools` allowlist when it was non-null, so omitting `allowedTools` skipped the check and forwarded every `tools/call` from the (untrusted) MCP App iframe to the host's `callTool`. A malicious or compromised MCP server could therefore invoke any tool the host wired up.

Tool invocation from MCP App content is now deny-by-default: if `allowedTools` is not explicitly provided, all `tools/call` requests are rejected. To expose tools to an app, list them in `handlers.allowedTools`.
