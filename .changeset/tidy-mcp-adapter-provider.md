---
'@ai-sdk/mcp': patch
---

Require an `Experimental_MCPEventsAdapterProvider` for experimental managed event configuration. Its synchronous `createAdapter({ url })` receives the configured MCP transport URL and returns the bound `Experimental_MCPEventsAdapter`, so applications do not need to configure the endpoint twice.

This changes the experimental `experimental_events.adapter` contract: wrap an existing bound adapter with `{ createAdapter: () => adapter }` instead of passing it directly. The subscription operations interface remains unchanged.
