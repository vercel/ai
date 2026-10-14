---
'@ai-sdk/harness-pi': patch
---

fix(harness-pi): judge a turn by its last attempt and keep suspend errors out of the stream

A turn that Pi recovered by retrying a failed request (rate limit, overload, context overflow after compaction) ended with an `error` part, because the first terminal error seen was kept for the whole turn. The last assistant message now decides the outcome, so a recovered turn ends with `finish`.

Once `doSuspendTurn` has begun, every terminal or thrown error of the turn being cut belongs to the suspend and no longer emits an `error` part. Before, only errors that looked like an abort were kept silent, and a request Pi started on an already-aborted signal reports `stopReason: 'error'` ("This operation was aborted") while a provider can also fail during the cut. Reporting such an error ended the slice as failed with the unfinished turn nested in its resume state, and a session built from that state refused every later prompt.
