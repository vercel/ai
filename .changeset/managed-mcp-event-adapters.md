---
'@ai-sdk/mcp': patch
---

Add experimental managed MCP Events adapters for backend-owned subscription lifecycles without a local event store. Rename the unreleased client event configuration to `experimental_events` and infer distinct managed and direct event APIs from a single MCPClientConfig and exclusive MCPEventsConfig union.
