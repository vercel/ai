---
'@ai-sdk/assemblyai': patch
---

fix(assemblyai): address code-review findings for the transcription provider

- Warn when options are set without their required prerequisite
  (`redactPiiReturnUnredacted`/`redactStaticEntities` without `redactPii`;
  `redactPiiAudioOptions` without `redactPiiAudio`; `languageCode` together with
  `languageDetection`), since AssemblyAI otherwise 400s or silently ignores them.
- Fix the `universal-2` nudge message (it previously claimed `universal-2` was
  being replaced by `universal-3-pro`).
- Attribute the `wordBoost`/`boostParam` deprecation warning to whichever option
  was actually set.
- Type `removeAudioTags` and `overrideAudioRedactionMethod` as enums (dropping
  the `as never` casts) so invalid values fail validation client-side.
- Honor a caller-provided `fetch` for the polling requests (not just upload/submit).
- Populate `providerMetadata.assemblyai` from the raw response so nested fields
  aren't stripped; document that its timings are in milliseconds while
  `segments` are in seconds.
- Correct the `redactPiiAudioOptions` docs (requires `redactPiiAudio`) and
  restore the Model Capabilities table rows for the supported models.
