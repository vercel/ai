---
'@ai-sdk/google': patch
'@ai-sdk/gateway': patch
'ai': patch
---

Add Gemini 3.8 TTS support with structured speech metadata, per-turn speaker and style controls, custom voice IDs, and Google Voices management. Preserve native WAV responses without adding a second header, support explicit raw PCM, mu-law, and A-law output, and identify headerless audio formats correctly. Add the Gemini 3.8 speech model IDs to Google and Gateway types.

Share transcript and custom-voice inspection through the Google provider internal export, and reject empty speech transcripts before sending a request. Default newer and custom model IDs to structured speech while preserving the legacy format for Gemini 2.5 and 3.1.
