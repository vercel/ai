---
"@ai-sdk/workflow": patch
---

Fix `WorkflowAgent` to stop after 20 steps by default, matching
`ToolLoopAgent`. This intentionally changes the behavior of an omitted
`stopWhen`: the workflow can stop while the model is still requesting tools,
and the result contains only work completed through the limit. Workflows that
relied on the previous unlimited default must set
`stopWhen: isLoopFinished()`. Explicit stream, constructor, and `prepareCall`
stop conditions continue to override the default.
