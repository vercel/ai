---
'@ai-sdk/workflow': patch
---

fix(workflow): `model`, `toolChoice`, `activeTools`, and generation settings returned from `prepareStep` in `WorkflowAgent` now apply to the current step only, like in `ToolLoopAgent`. Before, an override returned for one step stayed in effect for all later steps.
