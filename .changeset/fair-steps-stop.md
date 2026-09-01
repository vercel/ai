---
"@ai-sdk/workflow": patch
---

Fix `WorkflowAgent` to stop after 20 steps by default, matching
`ToolLoopAgent`. Workflows that intentionally relied on the previous unlimited
default can set `stopWhen: isLoopFinished()`. Explicit stream, constructor, and
`prepareCall` stop conditions continue to override the default.
