---
'@ai-sdk/gateway': patch
---

fix(provider/gateway): update `parallelSearch` for Parallel's GA Search API

- Accept the `turbo`, `fast`, `basic`, and `advanced` modes. Tool calls that use one of these modes no longer fail client-side input validation. `one-shot` and `agentic` are deprecated but still accepted.
- Add the `location` and top-level `maxCharsTotal` options, plus `fetchPolicy.timeoutSeconds` and `fetchPolicy.disableCacheFallback`. `excerpts.maxCharsTotal` is deprecated in favor of `maxCharsTotal`.
- Fix the result type and schema to match the response the gateway returns: `search_id`, results with `url`, nullable `title` and `publish_date`, and `excerpts: string[]`, plus optional `warnings`, `usage`, and `session_id`. The `searchId`, `excerpt`, `publishDate`, and `relevanceScore` fields were never populated and are removed; update code that reads them. `validateUIMessages` now accepts Parallel Search results.
