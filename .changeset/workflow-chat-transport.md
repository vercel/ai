---
'@ai-sdk/workflow': patch
---

Export `WorkflowChatTransport` with `initialStartIndex` support for resumable stream reconnection, including negative start index resolution via `x-workflow-stream-tail-index` header.
