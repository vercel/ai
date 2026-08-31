# @ai-sdk/baseten

## 0.1.6

### Patch Changes

- Updated dependencies [26165ee]
  - @ai-sdk/provider-utils@3.0.36
  - @ai-sdk/openai-compatible@1.0.53

## 0.1.5

### Patch Changes

- Updated dependencies [77d33c0]
  - @ai-sdk/provider-utils@3.0.35
  - @ai-sdk/openai-compatible@1.0.52

## 0.1.4

### Patch Changes

- Updated dependencies [e264a35]
  - @ai-sdk/openai-compatible@1.0.51

## 0.1.3

### Patch Changes

- Updated dependencies [2fff9f1]
- Updated dependencies [f364ea0]
  - @ai-sdk/provider-utils@3.0.34
  - @ai-sdk/openai-compatible@1.0.50

## 0.1.2

### Patch Changes

- Updated dependencies [9e8e087]
  - @ai-sdk/provider-utils@3.0.33
  - @ai-sdk/openai-compatible@1.0.49

## 0.1.1

### Patch Changes

- Updated dependencies [0e51b7b]
  - @ai-sdk/provider-utils@3.0.32
  - @ai-sdk/openai-compatible@1.0.48

## 0.1.0

### Minor Changes

- f74f8b4: Make the native performance client opt-in for embeddings.

  `@basetenlabs/performance-client` is no longer a dependency. It is a NAPI addon — 16 platform binary packages, ~5-16 MB installed — that could not load in edge runtimes and whose platform binaries bundlers could not resolve, and it was imported at module top level, so every consumer paid for it even though only embeddings use it.

  Embeddings now go over plain HTTP to the deployment's OpenAI-compatible endpoint, which is what Baseten Embeddings Inference serves with no additional settings. To keep the native client's client-side batching and request hedging, install it yourself and pass the constructor:

  ```ts
  import { createBaseten } from "@ai-sdk/baseten";
  import { PerformanceClient } from "@basetenlabs/performance-client";

  const baseten = createBaseten({
    modelURL,
    performanceClient: PerformanceClient,
  });
  ```

  The default path now supports things the previous implementation silently dropped: `abortSignal`, per-call `headers`, the `dimensions` and `user` provider options, and the provider's `fetch` option — `createBaseten({ fetch })` previously had no effect on embeddings. Response headers and warnings are now real rather than empty.

  `usage.tokens` now comes from `prompt_tokens` rather than `total_tokens`, matching the `EmbeddingModelV2` contract ("we only have input tokens for embeddings") and the other providers. The values are normally identical for embeddings.

  One behaviour change to be aware of: each request now sends at most 128 values. `embedMany` splits and parallelises above that, so only a direct `doEmbed` call with more than 128 values is affected — it throws `TooManyEmbeddingValuesForCallError`. The opt-in native path is unchanged and still receives everything in one call.

  Separately, report token usage for streamed chat completions. The provider never set `includeUsage`, so `stream_options.include_usage` was omitted from requests and OpenAI-compatible servers returned no usage at all for streams — `streamText` reported `inputTokens`/`outputTokens`/`totalTokens` as `undefined` while `generateText` on the same model reported them correctly. This affected both the Model APIs and dedicated-deployment paths.

  Also parse the error envelope dedicated deployments return. Baseten sends two different shapes: the Model APIs send `error` as a bare string (`{"error":"please check the model you provided"}`), while a dedicated deployment passes through its server's OpenAI-shaped `{"error":{"message":…,"code":…,"param":…,"type":…}}` object. The schema only accepted the string, so the object failed to parse and the message degraded to the HTTP reason phrase — a real `The model \`x\` does not exist.`surfaced as`Not Found`, or as the empty string over HTTP/2, which has no reason phrase. The schema now accepts both. This affects embeddings especially, since they require a `modelURL` and so always talk to a dedicated deployment.

## 0.0.30

### Patch Changes

- Updated dependencies [7a6bdbc]
  - @ai-sdk/provider-utils@3.0.31
  - @ai-sdk/openai-compatible@1.0.47

## 0.0.29

### Patch Changes

- Updated dependencies [2fd6076]
  - @ai-sdk/provider-utils@3.0.30
  - @ai-sdk/openai-compatible@1.0.46

## 0.0.28

### Patch Changes

- Updated dependencies [21eef03]
  - @ai-sdk/openai-compatible@1.0.45

## 0.0.27

### Patch Changes

- Updated dependencies [514775f]
  - @ai-sdk/openai-compatible@1.0.44

## 0.0.26

### Patch Changes

- Updated dependencies [c6e1d1a]
  - @ai-sdk/provider-utils@3.0.29
  - @ai-sdk/openai-compatible@1.0.43

## 0.0.25

### Patch Changes

- Updated dependencies [b85c4fb]
  - @ai-sdk/provider-utils@3.0.28
  - @ai-sdk/openai-compatible@1.0.42

## 0.0.24

### Patch Changes

- Updated dependencies [9169261]
  - @ai-sdk/provider-utils@3.0.27
  - @ai-sdk/openai-compatible@1.0.41

## 0.0.23

### Patch Changes

- Updated dependencies [9f67efe]
- Updated dependencies [eea9166]
  - @ai-sdk/provider-utils@3.0.26
  - @ai-sdk/openai-compatible@1.0.40

## 0.0.22

### Patch Changes

- Updated dependencies [cb61408]
  - @ai-sdk/openai-compatible@1.0.39

## 0.0.21

### Patch Changes

- 783fa6c: chore: ensure consistent import handling and avoid import duplicates or cycles
- Updated dependencies [783fa6c]
  - @ai-sdk/openai-compatible@1.0.38
  - @ai-sdk/provider-utils@3.0.25
  - @ai-sdk/provider@2.0.3

## 0.0.20

### Patch Changes

- 0a00b9b: trigger release for all packages after provenance setup
- Updated dependencies [0a00b9b]
  - @ai-sdk/openai-compatible@1.0.37
  - @ai-sdk/provider@2.0.2
  - @ai-sdk/provider-utils@3.0.24

## 0.0.19

### Patch Changes

- 5543cd1: Add AI Gateway hint to provider READMEs
- Updated dependencies [5543cd1]
  - @ai-sdk/openai-compatible@1.0.36

## 0.0.18

### Patch Changes

- Updated dependencies [a27a978]
  - @ai-sdk/provider-utils@3.0.23
  - @ai-sdk/openai-compatible@1.0.35

## 0.0.17

### Patch Changes

- Updated dependencies [6a2f01b]
- Updated dependencies [17d64e3]
  - @ai-sdk/provider-utils@3.0.22
  - @ai-sdk/openai-compatible@1.0.34

## 0.0.16

### Patch Changes

- Updated dependencies [20565b8]
  - @ai-sdk/provider-utils@3.0.21
  - @ai-sdk/openai-compatible@1.0.33

## 0.0.15

### Patch Changes

- Updated dependencies [8479fe8]
- Updated dependencies [7aadb9b]
  - @ai-sdk/openai-compatible@1.0.32

## 0.0.14

### Patch Changes

- Updated dependencies [fcb9d27]
  - @ai-sdk/openai-compatible@1.0.31

## 0.0.13

### Patch Changes

- 526fe8d: fix: trigger new release for `@ai-v5` dist-tag
- Updated dependencies [526fe8d]
  - @ai-sdk/openai-compatible@1.0.30
  - @ai-sdk/provider@2.0.1
  - @ai-sdk/provider-utils@3.0.20

## 0.0.12

### Patch Changes

- Updated dependencies [ef6d784]
  - @ai-sdk/provider-utils@3.0.19
  - @ai-sdk/openai-compatible@1.0.29

## 0.0.11

### Patch Changes

- Updated dependencies [d1dbe5d]
  - @ai-sdk/provider-utils@3.0.18
  - @ai-sdk/openai-compatible@1.0.28

## 0.0.10

### Patch Changes

- c8caaa8: add moonshotai/Kimi-K2-Thinking model ID for Baseten provider

## 0.0.9

### Patch Changes

- Updated dependencies [056c471]
  - @ai-sdk/provider-utils@3.0.17
  - @ai-sdk/openai-compatible@1.0.27

## 0.0.8

### Patch Changes

- 51aa5de: backport: test server
- Updated dependencies [51aa5de]
  - @ai-sdk/openai-compatible@1.0.26
  - @ai-sdk/provider-utils@3.0.16

## 0.0.7

### Patch Changes

- Updated dependencies [f2da310]
  - @ai-sdk/provider-utils@3.0.15
  - @ai-sdk/openai-compatible@1.0.25

## 0.0.6

### Patch Changes

- Updated dependencies [949718b]
  - @ai-sdk/provider-utils@3.0.14
  - @ai-sdk/openai-compatible@1.0.24

## 0.0.5

### Patch Changes

- Updated dependencies [1e05490]
  - @ai-sdk/provider-utils@3.0.13
  - @ai-sdk/openai-compatible@1.0.23

## 0.0.4

### Patch Changes

- Updated dependencies [f02b7ab]
  - @ai-sdk/openai-compatible@1.0.22

## 0.0.3

### Patch Changes

- Updated dependencies [17f9872]
  - @ai-sdk/provider-utils@3.0.12
  - @ai-sdk/openai-compatible@1.0.21

## 0.0.2

### Patch Changes

- 6f0644c: chore: use import \* from zod/v4
- Updated dependencies [6f0644c]
- Updated dependencies [6f0644c]
  - @ai-sdk/openai-compatible@1.0.20
  - @ai-sdk/provider-utils@3.0.11

## 0.0.1

### Patch Changes

- 9694b94: initial stable release
