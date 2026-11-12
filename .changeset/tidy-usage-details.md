---
'@ai-sdk/workflow': patch
---

fix(workflow): `WorkflowAgent.stream()` now aggregates `totalUsage` the same way as `ToolLoopAgent`. Token details such as cached and reasoning tokens are kept, and counts that the provider did not report stay `undefined` instead of becoming `0`.
