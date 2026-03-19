---
'ai': patch
---

Extract `modelCall()` from `streamText()` as a reusable primitive for single model invocations. The new async function encapsulates retry logic and stream parsing (via `prepareRetries` + `createStreamTextPartTransform`) and returns a stream, request metadata, and response metadata. Tool execution remains the caller's concern. Both `modelCall` and `createExecuteToolsTransformation` are exported from `ai/internal`.
