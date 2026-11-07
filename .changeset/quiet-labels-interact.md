---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Pass `providerOptions.google.labels` through to Google and Vertex AI Interactions requests, including streaming, so callers can attach request metadata such as `safety_identifier`.
