---
"@ai-sdk/langchain": patch
---

Add `onFinish`, `onError`, and `onAbort` callbacks to `StreamCallbacks` for `toUIMessageStream`.

- `onFinish(state)`: Called on successful completion with final LangGraph state (or `undefined` for other stream types)
- `onError(error)`: Called when stream encounters an error
- `onAbort()`: Called when stream is aborted

Also adds `parseLangGraphEvent` helper for parsing LangGraph event tuples.
