---
'@ai-sdk/openai-compatible': patch
'@ai-sdk/mistral': patch
'@ai-sdk/openai': patch
'@ai-sdk/groq': patch
---

fix(providers): use convertToBase64 for Uint8Array image parts to produce valid data URLs; keep mediaType normalization and URL passthrough
