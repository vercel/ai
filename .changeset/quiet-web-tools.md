---
'@ai-sdk/mcp': patch
---

Add `WebMCPTransport` to discover and call browser WebMCP tools through `createMCPClient`, with cancellation, frame-aware tool aliases, and structured results.

Add `createMCPTools` to validate forwarded MCP definitions and create model-facing tools without execute functions, sharing schema, metadata, and result conversion with connected MCP clients.
