---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): preserve unmapped usage fields in `usage.raw`

`usage.raw` is specified as usage "in the shape that the provider returns",
and the chat model already parsed the usage object loosely so that extra
top-level fields survived. The nested `prompt_tokens_details` and
`completion_tokens_details` objects were still strict, so anything a provider
reported inside them was dropped — which is where providers put their most
distinguishing detail. The existing "should preserve extra usage fields"
fixture was itself losing `audio_tokens`, `image_tokens` and `text_tokens`
this way.

Both nested objects are now parsed loosely, as is the completion model's usage
schema, which was strict throughout despite feeding the same `raw` field.

Only `usage.raw` changes. The mapped token counts are unaffected.
