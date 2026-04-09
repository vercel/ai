---
"ai": patch
---

feat (ai/core): support plain string model IDs in `rerank()` function

The `rerank()` function now accepts plain model strings (e.g., `'cohere/rerank-v3.5'`) in addition to `RerankingModel` objects, matching the behavior of `generateText`, `embed`, and other core functions.
