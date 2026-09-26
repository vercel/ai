---
'@ai-sdk/google': patch
---

fix(google): give each Gemini Live user turn its own input transcription item id so a new utterance no longer overwrites the previous user message
