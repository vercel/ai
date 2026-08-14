---
'@ai-sdk/workflow': patch
---

Fix `WorkflowAgent` timeout handling by enforcing absolute deadlines inside durable model-call steps and routing timeouts through abort handling.
