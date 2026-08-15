---
"@ai-sdk/deepgram": minor
---

feat(deepgram)!: transcription no longer defaults `diarize` to `true`

Speaker diarization is a paid Deepgram add-on, and the provider previously
sent `diarize=true` on every pre-recorded transcription request unless
explicitly opted out. `diarize` is now only sent when explicitly set in
`providerOptions.deepgram`. Users who relied on the old default must now
pass `providerOptions: { deepgram: { diarize: true } }`.
