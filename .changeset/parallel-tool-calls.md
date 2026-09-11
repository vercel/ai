---
'ai': patch
---

feat(ai): execute onToolCall callbacks in parallel during stream processing

Previously, `onToolCall` in `processUIMessageStream` was awaited sequentially,
blocking stream processing when multiple tool calls arrived in the same stream.
This change fires tool call callbacks concurrently and awaits them all in the
stream's `flush` handler, enabling parallel client-side tool execution.

Both synchronous throws and async rejections from `onToolCall` are now routed
to `onError` instead of crashing the stream.

Note: this changes the execution ordering — `onToolCall` side effects are no
longer guaranteed to complete before subsequent stream chunks are processed.
This is the expected behavior for parallel tool execution but is worth noting
for consumers that rely on ordering.
