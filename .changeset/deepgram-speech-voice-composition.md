---
"@ai-sdk/deepgram": minor
---

feat(deepgram)!: speech model IDs are now voice family IDs (`aura-2`, `aura`)

**Breaking change:** full voice model IDs (e.g.
`deepgram.speech('aura-2-helena-en')`) are no longer accepted. Pass a bare
voice family ID and select the voice and language via the `generateSpeech`
`voice` and `language` options — the provider composes the upstream model ID
as `<family>-<voice>-<language>` (language defaults to `en`):

```ts
generateSpeech({
  model: deepgram.speech('aura-2'),
  voice: 'helena',
  language: 'en',
  text: 'Hello, world!',
});
```

Passing a full voice ID throws a migration error naming the new call shape.
This matches how every other AI SDK speech provider selects voices.

Also in this release:

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
