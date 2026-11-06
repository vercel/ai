---
"@ai-sdk/amazon-bedrock": patch
"@ai-sdk/bytedance": patch
"@ai-sdk/fal": patch
"@ai-sdk/gateway": patch
"@ai-sdk/google": patch
"@ai-sdk/google-vertex": patch
"@ai-sdk/klingai": patch
"@ai-sdk/replicate": patch
---

fix: preserve `seed: 0` in image and video models

Truthy checks (`seed && { seed }`, `if (options.seed)`) silently dropped
`seed: 0` because `0` is falsy in JavaScript. Changed each check to a
`!= null` guard so that `seed: 0` is correctly passed through to the
underlying provider for deterministic generation.

Backport of ef2dfb5e9f to release-v6.0.
