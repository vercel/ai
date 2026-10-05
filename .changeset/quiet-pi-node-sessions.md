---
'@ai-sdk/harness-pi': patch
---

Skip host and project Pi package resolution when loading harness resources, avoiding repeated installations and npm output on host stdout. Bundle the MCP adapter as JavaScript so sessions with configured MCP servers work under Node without a TypeScript loader.
