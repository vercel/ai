---
'@ai-sdk/google-vertex': patch
'@ai-sdk/anthropic': patch
---

Add a `supportsNativeStructuredOutput` opt-in to the Vertex Anthropic provider so `auto` can use native structured output for Claude 4.5 and newer when enabled by Google Cloud policy. Keep tool emulation as the default and avoid adding the structured-output beta header for providers without strict tool support.
