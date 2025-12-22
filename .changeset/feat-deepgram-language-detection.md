---
'@ai-sdk/deepgram': patch
---

feat(deepgram): add language detection support

Add language detection support for Deepgram transcription. When `detectLanguage` is enabled, Deepgram will automatically detect the spoken language and return it in the response via `providerMetadata.deepgram.detectedLanguage`.
