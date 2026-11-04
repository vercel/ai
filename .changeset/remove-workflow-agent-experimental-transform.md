---
'@ai-sdk/workflow': patch
---

feat(workflow): remove `experimental_transform` from `WorkflowAgent.stream()`

Stream transforms cannot reliably run across workflow step boundaries, so the option has been removed along with the `StreamTextTransform` type export.
