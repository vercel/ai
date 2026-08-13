---
'@ai-sdk/workflow': patch
---

Fix `WorkflowAgent` timeout handling by creating timeout signals inside durable model-call steps, where the Web Abort API is available.
