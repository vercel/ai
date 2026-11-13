---
'@ai-sdk/harness-fx': patch
---

Replay events read ahead of a pinned step boundary when resuming an fx turn. Preserve recorded tool outcomes so completed tools are not executed again, while keeping tool-call and text stream events intact across `stopWhen` checkpoints.
