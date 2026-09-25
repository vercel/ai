---
'@ai-sdk/mcp': patch
---

Use `fetchUntrustedUrl` for OAuth metadata discovery, with an explicit opt-in
for the MCP protocol-version header. Protocol metadata remains available while
unknown headers are withheld from untrusted first-hop URLs.
