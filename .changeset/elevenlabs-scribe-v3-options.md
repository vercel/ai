---
'@ai-sdk/elevenlabs': patch
---

Add the Scribe v3 transcription options. Batch transcription accepts `numbersFormat` and `secondaryLanguageCodes`. Realtime transcription accepts `streaming.diarize`, `streaming.multilangMode`, `streaming.entityDetection`, `streaming.entityRedaction`, `streaming.entityRedactionMode`, and `streaming.transcriptEdit`. The diarized, entity, redacted, and edited transcripts that ElevenLabs sends after each committed transcript are returned in `providerMetadata.elevenlabs` when the stream finishes, and the stream now waits for them before finishing.
