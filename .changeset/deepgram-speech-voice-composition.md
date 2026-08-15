---
"@ai-sdk/deepgram": patch
---

feat(deepgram): speech voice/language composition, usage metadata, speed passthrough, and error parsing

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
