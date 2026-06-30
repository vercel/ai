---
'@ai-sdk/google': patch
---

Support Gemini Interactions video output. Parse video output blocks from the Google Interactions API into file parts (buffered and streaming), surface the per-modality output token breakdown via `providerMetadata.google.outputTokensByModality`, and route Omni-family model ids (e.g. `gemini-omni-flash-preview`) through the Interactions API automatically from `google(...)` and `google.languageModel(...)`.
