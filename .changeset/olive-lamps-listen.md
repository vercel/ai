---
'@ai-sdk/openai': patch
---

fix(provider/openai): resolve responses doStream at response.in_progress instead of first output token

The early-stream-error peek treated `response.in_progress` as an unknown chunk, so `doStream` did not resolve until the first output item arrived — delaying stream availability (and downstream TTFB for proxies/gateways) by the model's full time-to-first-token. `response.in_progress` is now modeled in the chunk schema and marks the request as accepted: the peek keeps watching for error frames for a short grace window (50ms) so quota/rate-limit errors flushed alongside `response.in_progress` still throw as retryable `APICallError`s, while healthy streams become available right after upstream acknowledges the request.
