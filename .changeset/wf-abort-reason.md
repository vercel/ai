---
'@ai-sdk/workflow': patch
---

fix(workflow): call `onAbort` instead of `onError` when a `WorkflowAgent` call is aborted during a model step with a custom abort reason. `generate()` still rejects with that reason. `stream()` now resolves with the steps that finished, as it does for an abort without a reason.
