---
'ai': patch
---

fix: guard against undefined warnings from EmbeddingModelV2 providers in embed/embedMany

`EmbeddingModelV2` providers (e.g. `@ai-sdk/google-vertex@3.x`) do not include `warnings` in their `doEmbed` return type, causing `embed()` and `embedMany()` to crash at runtime. This adds null-safety by defaulting `modelResponse.warnings` to `[]` and adding guards in `logWarnings` and the `embedMany` chunked aggregation path.
