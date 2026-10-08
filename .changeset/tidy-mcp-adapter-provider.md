---
'@ai-sdk/mcp': patch
---

Give experimental managed event adapters a synchronous `createAdapter({ transport })` method that receives the configured MCP transport type and URL and returns bound subscription operations. Applications no longer need to configure the endpoint twice.

**Breaking change to the experimental API:** the configured integration is now `Experimental_MCPEventAdapter` and must implement `createAdapter`. The former `Experimental_MCPEventsAdapter` subscription operations interface is renamed to `Experimental_MCPEventOperations`. Update imports and operation type annotations, and wrap existing operations with `{ createAdapter: () => operations }` instead of passing them directly to `experimental_events.adapter`.

`createAdapter` must synchronously return an object implementing `subscribe`, `getSubscription`, `listSubscriptions`, and `unsubscribe`. Missing or non-callable operations, nullish results, and Promise/thenable results now reject `createMCPClient` with `MCPClientError` before the transport starts.


The adapter receives a fresh `transport: { type: 'http' | 'sse', url: string }` description for built-in transport configurations or `transport: { type: 'custom' }` for custom instances. Credentials, callbacks, and live transport methods are not forwarded.
