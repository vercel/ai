---
'@ai-sdk/anthropic': patch
'@ai-sdk/google-vertex': patch
---

Read Anthropic options for Claude on Google Vertex from the legacy `providerOptions.vertex` key when `providerOptions.googleVertex` is absent. The key changed when the provider was renamed from `vertex` to `googleVertex`, which silently dropped options passed under `vertex`.
