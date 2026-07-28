---
"@ai-sdk/google": patch
---

Fix: strip frequencyPenalty/presencePenalty for gemini-2.5-* models on the Gemini Developer API, which no longer support these parameters there, to prevent an INVALID_ARGUMENT error. A warning is now emitted instead. Vertex AI requests are unaffected, since Vertex still supports these settings on Gemini 2.5 models.
