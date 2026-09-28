---
'@ai-sdk/google': patch
---

fix(google): give each Gemini Live user utterance its own input transcription item id, split at `finished` transcriptions (falling back to model turn boundaries until the server sends one), and emit the running transcript of the utterance, so a new utterance or a later fragment no longer overwrites the previous user message
