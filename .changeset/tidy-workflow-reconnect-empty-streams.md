---
'@ai-sdk/workflow': patch
---

Treat empty successful WorkflowChatTransport reconnect responses as reconnect errors so retries stop after the configured consecutive error limit.
