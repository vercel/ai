---
"@ai-sdk/revai": patch
---

fix(revai): make transcription job polling timeout configurable

`transcribe()` with `revai.transcription()` threw
`TranscriptionJobPollingTimedOut` after a hard-coded 60 second polling budget,
so long audio files failed even though the job completed later. The polling
timeout is now configurable with the new `pollTimeoutMs` provider setting and
can be overridden per call with `providerOptions.revai.pollTimeoutMs`.
