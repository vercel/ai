---
'@ai-sdk/provider-utils': patch
'@ai-sdk/google': patch
'@ai-sdk/topaz': patch
---

Encode provider-returned resource IDs in the Google (video, batch) and Topaz (image, video) providers before interpolating them into request URLs, matching the shared encoding introduced in #23679.

`google-video` (`operation.name`), `google-batch` (`batchId`), `topaz-image` (`process_id`) and `topaz-video` (`requestId`) are returned by the provider and were interpolated raw into status/cancel/download/poll URLs. A compromised or malicious provider response containing `.`, `..`, or encoded slashes could traverse the request path. These IDs now go through `encodePathSegment` (single-segment: Topaz) or the new `encodePathSegments` (multi-segment resource names like `operations/…` / `batches/…`: Google), preventing traversal while preserving legitimate multi-segment names. Closes the gap left by #23679, which covered the single-segment providers but skipped these.
