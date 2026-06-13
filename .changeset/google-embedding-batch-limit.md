---
'@ai-sdk/google': patch
---

Fix `embedMany` over-batching Google embedding models. The `maxEmbeddingsPerCall` limit is now `100` to match the hard cap of Gemini's `batchEmbedContents` endpoint, so large inputs are chunked into valid batches instead of throwing a 400 error.
