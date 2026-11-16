---
'@ai-sdk/workflow': patch
---

fix(workflow): evaluate a `toolApproval` policy with the runtime context of the current step. `WorkflowAgent` now passes the `runtimeContext` returned by `prepareStep` to the approval policy for that step instead of the context from the start of the call, so a policy that tightens permissions per step denies or requires approval for the calls it restricts, as in `ToolLoopAgent`.
