---
'@ai-sdk/harness': patch
---

Forward the `redactToolErrors` option in `toUIMessageStream` and `toUIMessageStreamResponse`.

When the context validation of a host tool fails, the `tool-error` stream part now carries the same error that the runtime receives (`Tool context validation failed.`). Previously it carried the detailed validation error, which includes the context value. The detailed error is still passed to `onToolExecutionEnd`.

When a host tool throws a value that is not an `Error` or a string, the `tool-error` stream part now carries the text that the runtime receives (`String(value)`), not the thrown value.
