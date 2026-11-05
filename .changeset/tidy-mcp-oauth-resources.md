---
'@ai-sdk/mcp': patch
---

fix(mcp): include the canonical MCP resource in OAuth authorization, code exchange, and refresh requests when protected resource metadata is unavailable or custom resource validation returns undefined, preventing unbound authorization grants.
