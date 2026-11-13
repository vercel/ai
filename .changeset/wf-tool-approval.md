---
'@ai-sdk/workflow': patch
'ai': patch
---

feat(workflow): support `toolApproval` in `WorkflowAgent`

`WorkflowAgent` accepts a `toolApproval` configuration in the constructor and per `generate()` or `stream()` call. The configuration takes precedence over a tool's `needsApproval` setting, and its functions run in workflow context, outside of the durable model steps. Calls that the configuration approves run in the same step, and calls that it denies receive an `execution-denied` tool result without pausing the workflow.
