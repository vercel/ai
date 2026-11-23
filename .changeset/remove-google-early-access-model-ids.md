---
'@ai-sdk/google': patch
---

fix(google): remove the file processing early access model IDs from the model ID suggestions

File slicing works with the regular Gemini 3 and Gemini 4 model IDs, such as `gemini-4-carbon`. Other model IDs can still be passed as strings.
