---
'@ai-sdk/workflow': patch
---

fix(workflow): `WorkflowAgent` uses the last value yielded by an async generator tool as the tool result, like `ToolLoopAgent`. A generator that throws after yielding produces a tool error.
