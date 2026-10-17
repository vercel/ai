---
'@ai-sdk/alibaba': patch
---

fix(alibaba): preserve unmapped usage fields in `usage.raw`

Alibaba's usage was parsed with strict `z.object` schemas, so any field the
provider does not explicitly map was dropped before reaching `usage.raw` —
including `prompt_tokens_details.cache_type`, which names the caching mode and
therefore the rate a cache read is billed at. Usage is now parsed loosely,
nested objects included, matching what the anthropic provider does.
