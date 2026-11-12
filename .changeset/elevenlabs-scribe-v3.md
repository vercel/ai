---
'@ai-sdk/elevenlabs': patch
---

Support the Scribe v3 transcription models. `scribe_v3_live` now streams through `experimental_streamTranscribe`; it was previously rejected as a non-streaming model. The `streaming.commitStrategy` option accepts `turn_prediction`, and an `invalid_request` event from the realtime endpoint now errors the stream with the provider's message. `scribe_v3` and `scribe_v3_live` are added to the transcription model ids.
