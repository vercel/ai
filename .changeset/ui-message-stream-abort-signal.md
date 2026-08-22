---
'ai': patch
---

feat (ai/ui): thread `AbortSignal` through `createUIMessageStream` so client-side cancellation (e.g. `useChat().stop()`) propagates to the backend. The signal is exposed on the `execute` callback for user code to short-circuit long generation loops, cancels the source reader of any merged streams, drops late `writer.write` calls, and closes the output stream so a wrapping `createUIMessageStreamResponse` terminates the HTTP body. Pass `request.signal` from your framework adapter to wire it up. Closes #9707.
