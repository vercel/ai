---
'@ai-sdk/gladia': patch
---

fix(gladia): preserve audio intelligence results in provider metadata

Gladia's audio intelligence add-ons (translation, summarization, named entity
recognition, sentiment analysis, audio-to-LLM, sentences, and subtitles) are no
longer stripped from `providerMetadata.gladia` during response parsing, and
`error_code` is included in the error message when a transcription job fails.
