---
'@ai-sdk/xai': patch
---

Fix streaming transcription stream parts against the live xAI STT API: `transcript-final` was emitted for every `is_final: true` event, but xAI re-sends the finalized text with `speech_final: false` before the `speech_final: true` event (duplicating finals) and also finalizes *fragments* whose text the eventual `speech_final` event merges and re-punctuates (later-revised finals). `transcript-final` is now only emitted on `speech_final: true`; finalized fragments surface as `transcript-partial`. Additionally, xAI's `transcript.done` event arrives with an empty `text`, which produced an empty `finish.text` and made `experimental_streamTranscribe` throw `NoTranscriptGeneratedError` despite a full transcript having streamed — the finish text now falls back to the accumulated finalized utterances (plus any trailing unfinalized text).
