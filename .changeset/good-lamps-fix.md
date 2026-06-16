---
'ai': patch
---

fix(ui): make `input` optional on `output-error` tool and dynamic-tool UI message parts

`validateUIMessages` rejected persisted assistant messages whose `output-error` tool parts had no `input` key. This happened for any errored tool call where the SDK set `input: undefined` (e.g. `NoSuchToolError` / `InvalidToolInputError`): JSON serialization stripped the `undefined` value, and Zod 4.4+ treats a missing `z.unknown()` key as a validation failure (previously it was implicitly optional). The schema now matches the runtime shape produced by `process-ui-message-stream`, so reloading a thread that contains an errored tool call no longer throws `AI_TypeValidationError`.
