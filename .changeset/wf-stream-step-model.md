---
'@ai-sdk/workflow': patch
---

fix(workflow): report the provider name and model ID of the called model in the steps of `WorkflowAgent.stream()` results, matching `ToolLoopAgent` and `WorkflowAgent.generate()`
