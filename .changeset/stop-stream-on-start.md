---
'ai': patch
---

fix(ai): end `streamText` cleanly and cancel the model stream when `stopStream()` is called on the `start` part, instead of failing with an unhandled "Cannot add inner stream: outer stream is closed" rejection
