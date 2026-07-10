---
"@ai-sdk/google": patch
---

Fix: strip frequencyPenalty/presencePenalty for gemini-2.5-\* models, which no longer support these parameters, to prevent an INVALID_ARGUMENT error from the Gemini API. A warning is now emitted instead.
