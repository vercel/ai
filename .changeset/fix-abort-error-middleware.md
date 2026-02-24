---
'ai': patch
---

fix(ai): handle AbortError from middleware in streamText

Fixed an issue where `result.steps` and other promises would hang forever when an `AbortError` was thrown by middleware using its own `AbortController`. Previously, the abort was only handled when the outer `abortSignal` passed to `streamText` was aborted. Now any `AbortError` is properly treated as an abort, allowing the stream to close cleanly and promises to resolve.
