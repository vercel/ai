---
'@ai-sdk/mcp': patch
---

Give experimental managed event adapters a synchronous `createAdapter({ url })` method that receives the configured MCP transport URL and returns bound subscription operations. Applications no longer need to configure the endpoint twice.

This changes the experimental `experimental_events.adapter` contract: wrap existing subscription operations with `{ createAdapter: () => operations }` instead of passing them directly. `Experimental_MCPEventsAdapter` now names this configured integration; its former subscribe, lookup, list and unsubscribe interface is exported as `Experimental_ManagedMCPEventOperations`.
