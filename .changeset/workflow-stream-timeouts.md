---
'@ai-sdk/workflow': patch
'ai': patch
---

feat(workflow): support the `timeout` object in `WorkflowAgent`

`generate()` and `stream()` accept `timeout: { totalMs, stepMs, firstChunkMs, chunkMs }` in addition to a number. `stepMs` limits each model call. In `stream()`, `firstChunkMs` and `chunkMs` limit the wait for model output. Invalid timeout values are rejected with an `InvalidArgumentError`. A timeout now also ends a model step when the provider stream ignores the abort signal.
