---
'@ai-sdk/baseten': patch
---

Make the native performance client opt-in for embeddings. `@basetenlabs/performance-client` is a NAPI addon that cannot load in edge runtimes and whose platform binaries bundlers cannot resolve, and it was a hard dependency loaded by every consumer — including chat-only ones — for a code path only embeddings reach. It is no longer a dependency at all.

Embeddings now use plain HTTP against the deployment's OpenAI-compatible endpoint, which Baseten Embeddings Inference serves with no additional settings. To keep the native client's client-side batching and request hedging, install it yourself and pass the constructor: `createBaseten({ modelURL, performanceClient: PerformanceClient })`.

Behaviour changes on the default path: usage tokens now come from `prompt_tokens` rather than `total_tokens`; each request sends at most 128 values, with `embedMany` splitting and parallelising larger inputs; response headers and warnings are now real rather than empty; and the `dimensions` and `user` provider options are now honoured.
