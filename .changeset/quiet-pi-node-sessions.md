---
'@ai-sdk/harness-pi': patch
---

Skip remote host and project Pi package resolution when loading harness resources, avoiding repeated installations and npm output on host stdout while preserving skills from local workspace packages and their resource filters. Filesystem extensions remain disabled. Bundle the MCP adapter as JavaScript so sessions with configured MCP servers work under Node without a TypeScript loader.
