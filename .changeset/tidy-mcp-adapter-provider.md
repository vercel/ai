---
'@ai-sdk/mcp': patch
---

Give experimental managed event adapters a synchronous `createAdapter({ url })` method that receives the configured MCP transport URL and returns bound subscription operations. Applications no longer need to configure the endpoint twice.

**Breaking change to the experimental API:** `Experimental_MCPEventsAdapter` now describes the configured integration with `createAdapter`, rather than the four subscription operations. Those operations are exported as `Experimental_MCPEventOperations`. Update operation type annotations and wrap existing operations with `{ createAdapter: () => operations }` instead of passing them directly to `experimental_events.adapter`.

`createAdapter` must synchronously return an object implementing `subscribe`, `getSubscription`, `listSubscriptions`, and `unsubscribe`. Missing or non-callable operations, nullish results, and Promise/thenable results now reject `createMCPClient` with `MCPClientError` before the transport starts.
