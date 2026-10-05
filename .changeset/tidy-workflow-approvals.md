---
'@ai-sdk/workflow': patch
---

Create tool approval requests independently of streaming so WorkflowAgent.generate and stream without a writable can resume approved calls. Preserve provider approval requests and forward approval responses without locally executing provider tools.
