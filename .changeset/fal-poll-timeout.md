---
"@ai-sdk/fal": patch
---

fix(fal): make transcription polling timeout configurable

`transcribe()` with `fal.transcription()` threw
`TranscriptionRequestTimedOut` after a fixed 60 second polling budget,
so long audio files failed even though the request completed later. The polling
timeout is now configurable with the new `pollTimeoutMs` provider setting and
can be overridden per call with `providerOptions.fal.pollTimeoutMs`.
The limit also covers a status request that stalls on the network: it is
aborted when the limit is reached.
