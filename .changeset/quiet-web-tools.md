---
'@ai-sdk/mcp': patch
---

Add `Experimental_WebMCPTransport` to discover and call browser WebMCP tools through `createMCPClient`, with cancellation, frame-aware tool aliases, and structured results. Export the browser API types as `Experimental_WebMCPModelContext` and `Experimental_WebMCPTool`.

Add `createMCPTools` to validate forwarded MCP definitions and create model-facing tools without execute functions, sharing schema, metadata, and result conversion with connected MCP clients. Invalid MCP App resource URI metadata is reported as `MCPClientError`, preserving the original validation error as its cause.
