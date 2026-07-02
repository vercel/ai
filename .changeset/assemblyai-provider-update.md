---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): support universal-3-5-pro and expand the transcription provider

- Add current speech models `universal-3-5-pro`, `universal-3-pro`, and
  `universal-2`, routed via AssemblyAI's `speech_models` parameter (the
  deprecated singular `speech_model` is used only for the legacy `best` model).
  Using `universal-3-pro`/`universal-2` emits an informational warning
  suggesting `universal-3-5-pro`.
- Deprecate the legacy `best` model (still works, warns) and remove `nano`,
  which AssemblyAI no longer accepts.
- Surface speaker diarization and audio-intelligence results: `doGenerate` now
  returns the full raw response on `response.body` and populates
  `providerMetadata.assemblyai` with `utterances`, `entities`,
  `sentimentAnalysisResults`, `contentSafetyLabels`, `iabCategoriesResult`, and
  `autoHighlightsResult`.
- Add provider options for newer request parameters: `prompt`, `keytermsPrompt`,
  `temperature`, `removeAudioTags`, `domain`, `speakerOptions`,
  `languageDetectionOptions`, `redactPiiAudioOptions`,
  `redactPiiReturnUnredacted`, and `redactStaticEntities`. Deprecate
  `wordBoost`/`boostParam` in favor of `keytermsPrompt` (AssemblyAI rejects
  `word_boost` on the newer models).
- Fix transcription segment timings, which were reported in milliseconds instead
  of seconds.
