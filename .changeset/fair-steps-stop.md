---
"@ai-sdk/workflow": patch
---

Fix `WorkflowAgent` to stop after 20 steps by default, matching
`ToolLoopAgent`. This changes the behavior of an omitted `stopWhen`; workflows
that intentionally relied on the previous unlimited default must set
`stopWhen: isLoopFinished()`. Explicit stream, constructor, and `prepareCall`
stop conditions continue to override the default.
