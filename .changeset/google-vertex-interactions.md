---
'@ai-sdk/google-vertex': patch
'@ai-sdk/google': patch
---

Add `vertex.interactions()` for the Gemini Interactions API on Vertex AI. Targets the location-scoped `.../locations/{region}/interactions` resource using the existing Vertex OAuth credentials, enabling multimodal-output models such as `gemini-omni-flash-preview` (video output) through Vertex. The `GoogleInteractionsLanguageModel` is now exported from `@ai-sdk/google/internal` for provider reuse.
