---
"@ai-sdk/anthropic": patch
---

feat(anthropic): accept an async `authToken` function for workload identity federation

`authToken` now also accepts a function that resolves the token before each request, e.g. a federated access token from `@anthropic-ai/sdk`'s `TokenCache`. Requests authenticated this way send the `oauth-2025-04-20` beta header, merged with any other betas.
