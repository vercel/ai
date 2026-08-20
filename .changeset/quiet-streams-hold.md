---
"ai": patch
---

Isolate `onChunk` and `onError` throws in `streamText` so they do not break the stream or hide the original provider error.
