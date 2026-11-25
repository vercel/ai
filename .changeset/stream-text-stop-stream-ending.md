---
'ai': patch
---

feat(ai): end the stream when an `experimental_transform` calls `stopStream`

Calling `stopStream` in an `experimental_transform` now ends the stream: `streamText` closes open text, reasoning, and tool input parts and emits `finish-step` and `finish` parts with the step's response metadata, timings, and usage. Transformations no longer need to emit these parts themselves; transformations that still do will emit duplicate parts. `stopStream` accepts an optional finish reason (`stopStream({ finishReason: 'content-filter' })`, default: `other`). Parts that the transformation has not received yet are dropped, including text that earlier transformations such as `smoothStream` still buffer. Running tool executions are aborted and no further steps are started.
