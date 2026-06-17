---
'@ai-sdk/workflow': patch
---

Add constructor-level defaults for `stopWhen`, `activeTools`, `output`, `experimental_repairToolCall`, and `experimental_download` to WorkflowAgent, matching ToolLoopAgent's pattern. Stream-level values override constructor defaults.
