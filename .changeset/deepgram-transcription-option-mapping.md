---
"@ai-sdk/deepgram": minor
---

fix(deepgram): send parsed transcription options to the API; stop defaulting diarize

- `keyterm`, `paragraphs`, `intents`, `sentiment`, and `replace` were
  accepted in `providerOptions.deepgram` but silently dropped from the
  `/v1/listen` request. They are now sent as query parameters. Also widens
  the provider callable signature from `'nova-3'` to any transcription
  model ID.
- **Behavior change:** `diarize` no longer defaults to `true`. Speaker
  diarization is a paid Deepgram add-on, and the provider previously sent
  `diarize=true` on every pre-recorded request unless explicitly opted
  out. It is now only sent when explicitly set in
  `providerOptions.deepgram`. Users who relied on the old default must
  pass `providerOptions: { deepgram: { diarize: true } }`.
