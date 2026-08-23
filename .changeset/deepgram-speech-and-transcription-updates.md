---
"@ai-sdk/deepgram": minor
---

feat(deepgram): transcription option fixes + speech voice/language composition, usage metadata, speed passthrough, and error parsing

Transcription:

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

Speech:

- Bare voice family IDs (`aura-2`, `aura`) compose the upstream model ID
  from the `generateSpeech` `voice` and `language` options
  (`<family>-<voice>-<language>`, language defaults to `en`) and require
  `voice`; full voice IDs (e.g. `aura-2-helena-en`) keep passing through
  unchanged. The `DeepgramSpeechModelId` union is trimmed to the family
  IDs plus the string escape hatch.
- `providerMetadata.deepgram` carries `modelName`, `modelUuid`,
  `additionalModelUuids`, `charCount` (the billed character count),
  `breaksApplied`, `pronunciationsApplied`, `pronunciationWarnings` (when
  present), and `requestId` from the `/v1/speak` response headers.
- The `speed` option is passed through to Deepgram's `speed` parameter
  (accepted range 0.7–1.5) instead of being ignored with a warning.
- API errors now parse Deepgram's `{ "err_code", "err_msg", "request_id" }`
  error shape, so `APICallError.message` carries the real cause instead of
  the HTTP reason phrase. The legacy `{ "error": { "message", "code" } }`
  schema was dropped: no endpoint returns it.
