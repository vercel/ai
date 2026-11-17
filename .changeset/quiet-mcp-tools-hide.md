---
'@ai-sdk/google-vertex': patch
---

fix(provider/google): redact MCP server credentials in telemetry

Expose `googleVertex.tools.mcpServer` for Google Vertex Interactions models. Its
MCP server header values are redacted from telemetry, matching
`@ai-sdk/google`.
