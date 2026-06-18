---
'ai': patch
---

fix(ai): enforce `timeout.stepMs` for the whole step in `streamText`

Previously `streamText`'s step timer was cleared synchronously right after the step's stream was registered, before the stream produced anything, so `stepMs` never aborted a step that stalled before emitting content. The step timer now survives until the step's stream finishes or aborts, matching `generateText`. `chunkMs`/`totalMs` and normal step-finish cleanup are unchanged.
