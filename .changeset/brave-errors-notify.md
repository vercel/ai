---
'@ai-sdk/workflow': patch
---

fix(workflow): `WorkflowAgent` now accepts `onError` and `onAbort` in the constructor, like `ToolLoopAgent`. They are called before the callbacks passed to `generate()` or `stream()`. An error thrown by an `onError` or `onAbort` callback no longer replaces the error or result of the run.
