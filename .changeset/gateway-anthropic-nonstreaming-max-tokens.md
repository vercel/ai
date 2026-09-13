---
'@ai-sdk/gateway': patch
---

fix(gateway): handle Anthropic requests exceeding 21,333 tokens via streaming fallback in doGenerate (#20649)

Non-streaming requests to Anthropic models via AI Gateway with `max_tokens` (plus reasoning budget) exceeding 21,333 are rejected by the gateway with HTTP 400 (`max output tokens plus reasoning effort tokens must be under 21K`), while the same requests succeed with `stream: true`. `GatewayLanguageModel.doGenerate` now automatically utilizes streaming under the hood and collects the response for Anthropic requests exceeding 21,333 tokens, and falls back to streaming if the gateway returns the 21K limit rejection error.
