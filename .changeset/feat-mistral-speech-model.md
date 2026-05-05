---
'@ai-sdk/mistral': minor
---

Add Voxtral speech model support to `@ai-sdk/mistral`. The new `MistralSpeechModel` implements `SpeechModelV4` and calls the `/v1/audio/speech` endpoint. Supports output formats `mp3`, `opus`, `aac`, `flac`, `wav`, and `pcm`. Accessible via `mistral.speech(modelId)` and `mistral.speechModel(modelId)`.
