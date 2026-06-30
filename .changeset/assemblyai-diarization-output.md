---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): surface speaker diarization and audio-intelligence results

Previously the AssemblyAI provider parsed the transcript response with a
restrictive schema and returned that parsed object as `response.body`, which
silently dropped speaker labels, utterances, and all audio-intelligence results
(even though the matching `providerOptions` could enable them).

The provider now:

- returns the complete, raw AssemblyAI response on `response.body` (nothing is
  stripped), and
- surfaces structured results for currently-available features on
  `providerMetadata.assemblyai`: `utterances` (speaker diarization),
  `entities`, `sentimentAnalysisResults`, `contentSafetyLabels`,
  `iabCategoriesResult`, and `autoHighlightsResult`.

Word-level `speaker`/`channel`/`confidence` and `utterances` are now parsed.
Deprecated AssemblyAI features (Summarization, Auto Chapters, Custom Topics) are
intentionally not promoted to `providerMetadata` but remain on the raw
`response.body` when enabled.
