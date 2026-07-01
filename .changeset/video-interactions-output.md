---
'@ai-sdk/google': patch
---

Support Gemini Interactions video output. Parse video output blocks from the Google Interactions API into file parts (buffered and streaming), and surface the per-modality output token breakdown via `providerMetadata.google.outputTokensByModality`.
