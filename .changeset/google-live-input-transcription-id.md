---
'@ai-sdk/google': patch
---

fix(google): give each Gemini Live user turn its own input transcription item id and accumulate its transcription fragments, so a new utterance or a later fragment no longer overwrites the previous user message
