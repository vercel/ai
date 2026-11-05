---
'@ai-sdk/gladia': patch
---

fix(gladia): make transcription job polling timeout configurable

`transcribe()` with `gladia.transcription()` threw `TranscriptionJobPollingTimedOut`
after a hard-coded 60 second polling budget, so long audio files or jobs with audio
intelligence add-ons failed even though the job completed later. The polling timeout
now defaults to 10 minutes and can be configured with the new `pollTimeoutMs`
provider setting, `pollIntervalMs` controls the interval between status checks, and
both can be overridden per call with `providerOptions.gladia`. An `abortSignal` now
also cancels the wait between polls and preserves its abort reason.
