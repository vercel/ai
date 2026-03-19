---
'ai': major
---

Extract `modelCall()` from `streamText()` as a reusable primitive for single model invocations. The new function encapsulates retry logic and stream parsing (via `prepareRetries` + `createStreamTextPartTransform`) and returns a synchronous result with a stream, request promise, and response promise. Tool execution remains the caller's concern. Both `modelCall` and `createExecuteToolsTransformation` are exported from `ai/internal`.

**Breaking change:** When `streamText()` is aborted during streaming in a multi-step flow (e.g., abort fires during the 2nd step's raw stream), the `start-step` event for the aborted step is no longer emitted before the `abort` event. Previously the stream would emit `start-step` followed by `abort`; now it emits `abort` directly. This is due to the internal stitchable stream in `modelCall` discarding buffered chunks when the source stream errors.
