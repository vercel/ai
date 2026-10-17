---
'@ai-sdk/workflow': patch
---

fix(workflow): stream provider-executed tool calls in place in `WorkflowAgent` so UI stream consumers no longer fail with `No tool invocation found` for provider tools such as OpenAI `file_search` and `image_generation`, skip the deferred tool-call write step when no call was deferred, and pass a `TypeValidationError` cause to `repairToolCall` for original-schema failures
