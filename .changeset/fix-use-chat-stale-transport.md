---
'@ai-sdk/react': patch
---

fix(react): prevent stale transport in useChat when React state changes

Previously, the `transport` option passed to `useChat` (including its `body`, `headers`, etc.) was captured once when the `Chat` instance was created and never updated on subsequent renders. This caused `transport.body` values referencing React state to always send the initial (stale) value.

The fix applies the same ref-based indirection pattern already used for callbacks (`onToolCall`, `onFinish`, etc.) to the transport. The transport is now wrapped in stable functions that always delegate to the latest transport ref, ensuring that state-dependent `body` values are fresh when `sendMessages` is called.
