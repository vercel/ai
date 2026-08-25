---
'ai': patch
---

fix(ai): surface mid-stream provider SSE errors as `Error` instances with `statusCode`

Mid-stream provider SSE `error` events (e.g. Anthropic `error` events emitted
after the first chunk) were forwarded to consumers as raw plain objects, so they
failed `instanceof Error` checks, carried no `statusCode`, and broke error
handling in streaming consumers. `streamText` now normalizes such error values
into `Error` instances, preserving `.message` and attaching `statusCode`, `type`,
and `isRetryable` when the provider includes them. Existing `Error` instances and
string error values are passed through unchanged.
