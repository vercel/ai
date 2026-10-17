---
'@ai-sdk/cartesia': patch
---

Stop rejecting non-English `language` values for Ink 2 streaming and realtime transcription. Ink 2 supports English, French, Hindi, Japanese and Spanish and detects the language itself. Streaming results no longer report `en` when no language option is set.
