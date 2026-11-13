---
'@ai-sdk/workflow': patch
---

feat(workflow): support `toolOrder` in `WorkflowAgent`

`WorkflowAgent` accepts `toolOrder` in the constructor, per call in `generate()` and `stream()`, and from `prepareCall` and `prepareStep`. Listed tools are sent first in the listed order, and the remaining tools follow in alphabetical order.
