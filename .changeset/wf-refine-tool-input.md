---
'@ai-sdk/workflow': patch
---

feat(workflow): support `experimental_refineToolInput` in `WorkflowAgent`, in the constructor and per call. Refined tool inputs are used for tool execution, step results, callbacks, and the next model call, like in `ToolLoopAgent`.
