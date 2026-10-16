---
'@ai-sdk/workflow': patch
---

feat(workflow): add opt-in `streamRetries` to WorkflowAgent for provider errors received after the model stream opens

`streamRetries` matches the `streamText` option: it retries provider error stream parts and failed reads of the response stream (each retry runs as a new durable model step), and `onError` can return `{ retry: true }` to request one more retry after automatic retries are exhausted. Error chunks of retried attempts are not written to the writable. `maxRetries` continues to cover only failures before the response stream opens.
