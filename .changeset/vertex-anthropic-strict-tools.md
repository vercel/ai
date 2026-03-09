---
'@ai-sdk/google-vertex': patch
'@ai-sdk/anthropic': patch
---

fix(vertex/anthropic): pass strict mode for tools

Added `supportsStrictToolSchemas` config option to decouple strict tool schema support from native structured output support. This fixes the Google Vertex Anthropic provider ignoring `strict: true` on tool definitions, which was caused by `supportsNativeStructuredOutput: false` also preventing the `strict` field from being passed through to the API.
