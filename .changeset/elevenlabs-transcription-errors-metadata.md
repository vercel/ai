---
'@ai-sdk/elevenlabs': patch
---

Report more of what ElevenLabs returns for transcription. Realtime error events now fail the stream with an `APICallError` that carries the ElevenLabs event as `data`, so the error type (`auth_error`, `invalid_request`, `rate_limited`, ...) can be read from `error.data.message_type`, and `isRetryable` is set for capacity errors; the message is unchanged. An unexpected close reports its close code and reason. Realtime transcription returns word details and warnings in the finish provider metadata and the turn probability on partial transcripts. Batch transcription returns `languageProbability`, `transcriptionId`, and word `logprob` in provider metadata, and reports the `character-cost` response header as `usage.characterCost`.
