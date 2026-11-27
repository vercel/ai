---
'@ai-sdk/workflow': patch
---

perf(workflow): reuse the JSON Schema of tool input schemas across model calls, and add `includeMessagesInToolExecution` to keep the conversation out of tool step inputs
