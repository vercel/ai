---
'@ai-sdk/workflow': patch
'ai': patch
---

fix(workflow): align the `prepareStep` results of `WorkflowAgent` with `ToolLoopAgent`. Returned `instructions` (or the deprecated `system`) replace the instructions of the step and carry forward to later steps, returned `providerOptions` are merged with the agent options, and returned `headers` are merged over the headers of the call.
