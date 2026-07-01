---
"@ai-sdk/google": patch
---

fix(google): don't warn about a missing `thoughtSignature` on Gemini 3 parallel function calls (the model signs only the first call of a batch)
