---
'@ai-sdk/gladia': patch
---

Preserve Gladia audio intelligence results (translation, summarization, named entity recognition, sentiment analysis, audio-to-LLM, sentences, and subtitles) in `providerMetadata.gladia` instead of stripping them during response parsing, and include Gladia's `error_code` in the error message when a transcription job fails.
