---
'ai': patch
---

Prevent exceptions in streaming `onChunk` and `onError` callbacks from terminating the stream or masking provider errors.
