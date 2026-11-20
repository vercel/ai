---
'@ai-sdk/google': patch
---

Add a `store` provider option to Gemini language models. Set `providerOptions.google.store` to `false` to send `"store": false` with `generateContent` and `streamGenerateContent` requests, which opts the request out of the Gemini API's Logs and Datasets. The option is ignored with a warning on Vertex AI.
