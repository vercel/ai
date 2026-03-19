---
'ai': patch
---

Extract `modelCall()` from `streamText()` as a reusable primitive for single model invocations. The new function encapsulates retry logic and stream parsing (via `prepareRetries` + `createStreamTextPartTransform`) and returns a synchronous result with a stream, request promise, and response promise. Tool execution remains the caller's concern. Both `modelCall` and `createExecuteToolsTransformation` are exported from `ai/internal`.
