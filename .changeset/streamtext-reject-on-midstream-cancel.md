---
'ai': patch
---

fix(ai): reject `streamText` result promises when the stream is cancelled mid-body

When the underlying fetch body stream is cancelled mid-flight (e.g. a custom `fetch` combines its own `AbortSignal.timeout` via `AbortSignal.any`, or any error surfaces after response headers arrive but before a `finish` chunk), `streamText`/`ToolLoopAgent.stream()` would hang forever: `result.text`, `result.steps`, and the other awaited result promises never settled because the event processor's `flush` only runs on a graceful close. The stream error is now propagated to the still-pending result promises so they reject instead of hanging.
