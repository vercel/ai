---
'@ai-sdk/groq': patch
---

fix (provider/groq): surface prompt cache reads in usage

`convertGroqUsage` accepted `prompt_tokens_details.cached_tokens` but never read it, so cache hits were reported as `cacheRead: undefined` and the entire prompt was counted as `noCache`. Groq's implicit prompt caching now surfaces as `usage.cachedInputTokens` (mapped to `cacheRead`, subtracted from `noCache`). Groq has no cache-creation charge, so `cacheWrite` remains undefined.
