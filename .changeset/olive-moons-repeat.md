---
'@ai-sdk/alibaba': patch
---

fix(alibaba): preserve unmapped usage fields in `usage.raw`

Alibaba's usage was parsed with strict `z.object` schemas, so any field the
provider does not explicitly map was dropped before reaching `usage.raw` —
including `prompt_tokens_details.cache_type`, which names the caching mode and
therefore the rate a cache read is billed at. Usage is now parsed loosely,
nested objects included, matching what the anthropic provider does.

A response carrying no usage now maps to a fully null usage object rather than
one with `noCache` and `cacheWrite` zeroed and every other field undefined.

This provider no longer depends on `@ai-sdk/openai-compatible`. It implements
its own language model rather than building on the shared one, but still
reached into that package's internals for usage conversion, tool preparation
and finish-reason mapping. Those now live in the provider, alongside the
equivalents in `@ai-sdk/deepseek`, `@ai-sdk/groq`, `@ai-sdk/mistral` and
`@ai-sdk/xai`. Behavior is unchanged.
