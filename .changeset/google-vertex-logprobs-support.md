---
'@ai-sdk/google': patch
---

Add logprobs support for Google Gemini and Vertex AI models. Users can now request token log probabilities via `providerOptions` (`responseLogprobs` and `logprobs` with range 1-20) and access the results in `providerMetadata` (`logprobsResult` and `avgLogprobs`).

Note: Logprobs are only supported with `generateText`, not `streamText`.
