---
'@ai-sdk/cohere': patch
---

fix(cohere): read the response id from v2 chat responses

The non-streaming response schema read `generation_id`, which Cohere's v2 chat
response does not return. As a result, `generateText().response.id` was a locally
generated fallback instead of the provider's id, while `streamText` returned the
id from the `message-start` event. `doGenerate` now reads `id` and keeps
`generation_id` (the v1 field) only for compatibility with proxies and mocks that
still return it.
