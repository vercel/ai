---
'@ai-sdk/azure': patch
---

feat(azure): support MAI-Voice-2.1 and MAI-Voice-2.1-Flash speech generation, and MAI-Transcribe-2-Streaming streaming transcription through the MAI realtime API. Adds the `maiBaseURL` and `webSocket` settings and `providerOptions.azure.api: 'mai'`. Unknown MAI voices or styles now fail with a descriptive, non-retryable error.
