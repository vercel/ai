---
'@ai-sdk/azure': patch
---

Add MAI-Transcribe-2 file transcription through `azure.transcription()` using the Azure Speech API, with diarization, word/segment timestamps, transcript styles, locale forcing, and phrase lists. Select the API with `providerOptions.azure.api` to override model-based routing, and add `azure.transcriptionModel()` as an alias of `azure.transcription()`.
