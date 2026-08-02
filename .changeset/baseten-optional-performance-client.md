---
'@ai-sdk/baseten': minor
---

Make the native performance client opt-in for embeddings.

`@basetenlabs/performance-client` is no longer a dependency. It is a NAPI addon — 16 platform binary packages, ~5-16 MB installed — that could not load in edge runtimes and whose platform binaries bundlers could not resolve, and it was imported at module top level, so every consumer paid for it even though only embeddings use it.

Embeddings now go over plain HTTP to the deployment's OpenAI-compatible endpoint, which is what Baseten Embeddings Inference serves with no additional settings. To keep the native client's client-side batching and request hedging, install it yourself and pass the constructor:

```ts
import { createBaseten } from '@ai-sdk/baseten';
import { PerformanceClient } from '@basetenlabs/performance-client';

const baseten = createBaseten({ modelURL, performanceClient: PerformanceClient });
```

The default path now supports things the previous implementation silently dropped: `abortSignal`, per-call `headers`, the `dimensions` and `user` provider options, and the provider's `fetch` option — `createBaseten({ fetch })` previously had no effect on embeddings. Response headers and warnings are now real rather than empty.

`usage.tokens` now comes from `prompt_tokens` rather than `total_tokens`, matching the `EmbeddingModelV4` contract ("we only have input tokens for embeddings") and the other providers. The values are normally identical for embeddings.

One behaviour change to be aware of: each request now sends at most 128 values. `embedMany` splits and parallelises above that, so only a direct `doEmbed` call with more than 128 values is affected — it throws `TooManyEmbeddingValuesForCallError`. The opt-in native path is unchanged and still receives everything in one call.
