---
'@ai-sdk/alibaba': patch
---

feat(alibaba): add `reasoningEffort` and `promptCacheOptions` provider options, and parse cache writes by TTL

`reasoningEffort` is sent as `reasoning_effort`, so models such as `qwen4-max` can use named effort levels. `promptCacheOptions` is sent as `prompt_cache_options` for automatic caching and a 5-minute or 1-hour cache TTL. `cacheControl` breakpoints also accept `ttl`, and the `cache_creation` split of cache writes by TTL is kept in `usage.raw` and declared on `AlibabaUsage`.
