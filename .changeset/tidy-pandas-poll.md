---
'@ai-sdk/gladia': patch
---

fix(gladia): make transcription job polling timeout configurable

`transcribe()` with `gladia.transcription()` threw `TranscriptionJobPollingTimedOut`
after a hard-coded 60 second polling budget, so long audio files or jobs with audio
intelligence add-ons failed even though the job completed later. The polling timeout
now defaults to 10 minutes and can be configured with the new `pollingTimeoutMs`
provider setting, `pollingIntervalMs` controls the interval between status checks,
and an `abortSignal` now also cancels the wait between polls.
