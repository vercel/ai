---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): add speaker, language-detection, and PII-redaction options

Adds provider options for AssemblyAI's nested request parameters:

- `speakerOptions` — `{ minSpeakersExpected, maxSpeakersExpected }`
- `languageDetectionOptions` — `{ expectedLanguages, fallbackLanguage, codeSwitching, codeSwitchingConfidenceThreshold }`
- `redactPiiAudioOptions` — `{ returnRedactedNoSpeechAudio, overrideAudioRedactionMethod }`
- `redactPiiReturnUnredacted` — return the unredacted transcript alongside the redacted one
- `redactStaticEntities` — map of labels to exact terms to redact (e.g. `{ INTERNAL_TOOL: ['Bearclaw'] }`)

The `redactPii*` options require `redactPii` to be enabled.
