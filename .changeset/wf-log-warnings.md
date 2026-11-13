---
'@ai-sdk/workflow': patch
'ai': patch
---

fix(workflow): log provider warnings in `WorkflowAgent`

`WorkflowAgent.generate()` and `WorkflowAgent.stream()` now log the warnings of every model call through the AI SDK warning logger, like `ToolLoopAgent`. The `AI_SDK_LOG_WARNINGS` global controls the output.
