---
'ai': patch
---

Add `onError`, `onChunk`, and `onAbort` callbacks to `ToolLoopAgent.stream`.

The callbacks can be configured on the `ToolLoopAgent` or passed to individual
`stream` calls. When both are provided, both callbacks are invoked.
