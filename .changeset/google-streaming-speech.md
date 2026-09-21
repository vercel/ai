---
'@ai-sdk/provider': patch
'@ai-sdk/google': patch
'ai': patch
---

Add experimental streaming speech support with an optional speech model `doStream` method and `experimental_streamSpeech`. Google Gemini 3.1 TTS streams raw PCM audio through `streamGenerateContent`, including voice and multi-speaker configuration and per-chunk sample-rate metadata.
