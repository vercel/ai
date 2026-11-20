---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): add the `assemblyai-stt-3-7` transcription model and the `assemblyai-tts-1` speech model

- Add `assemblyai-stt-3-7`, AssemblyAI's latest pre-recorded transcription model, with prompting, keyterms, temperature, and `removeAudioTags` support.
- Emit a deprecation warning for `universal-3-5-pro`, which AssemblyAI has deprecated, and point the `universal-2` notice to `assemblyai-stt-3-7`.
- Stop listing `universal-3-pro`, which AssemblyAI has deprecated and no longer includes in its accepted models.
- Remove the `best` model and the singular `speech_model` request parameter it used, which AssemblyAI now rejects. `best` and `slam-1` are sent through `speech_models` like any other ID, so AssemblyAI's error lists the accepted models.
- Add `assemblyai.speech()` for the AssemblyAI text-to-speech API (`assemblyai-tts-1`), with `voice`, `language`, and `outputFormat` mapping, `encoding`/`container`/`sampleRate`/`bitRate` provider options, and billed characters reported as speech usage and in `providerMetadata`.
