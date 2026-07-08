---
'@ai-sdk/groq': patch
---

fix (provider/groq): report cached prompt tokens as `cacheRead`

`convertGroqUsage` parsed `prompt_tokens_details.cached_tokens` but never used it, so a prompt-cache hit was reported as `cacheRead: undefined` and `noCache: <full prompt>`. Cached tokens are now surfaced as `cacheRead`, with `noCache` reduced accordingly.
