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

`usage.tokens` now comes from `prompt_tokens` rather than `total_tokens`, matching the `EmbeddingModelV2` contract ("we only have input tokens for embeddings") and the other providers. The values are normally identical for embeddings.

One behaviour change to be aware of: each request now sends at most 128 values. `embedMany` splits and parallelises above that, so only a direct `doEmbed` call with more than 128 values is affected — it throws `TooManyEmbeddingValuesForCallError`. The opt-in native path is unchanged and still receives everything in one call.

Separately, report token usage for streamed chat completions. The provider never set `includeUsage`, so `stream_options.include_usage` was omitted from requests and OpenAI-compatible servers returned no usage at all for streams — `streamText` reported `inputTokens`/`outputTokens`/`totalTokens` as `undefined` while `generateText` on the same model reported them correctly. This affected both the Model APIs and dedicated-deployment paths.

Also parse the error envelope dedicated deployments return. Baseten sends two different shapes: the Model APIs send `error` as a bare string (`{"error":"please check the model you provided"}`), while a dedicated deployment passes through its server's OpenAI-shaped `{"error":{"message":…,"code":…,"param":…,"type":…}}` object. The schema only accepted the string, so the object failed to parse and the message degraded to the HTTP reason phrase — a real `The model \`x\` does not exist.` surfaced as `Not Found`, or as the empty string over HTTP/2, which has no reason phrase. The schema now accepts both. This affects embeddings especially, since they require a `modelURL` and so always talk to a dedicated deployment.
