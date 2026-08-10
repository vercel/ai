---
'@ai-sdk/openai-compatible': patch
---

fix(provider/openai-compatible): clamp `outputTokens.text` at 0 when a provider reports `completion_tokens_details.reasoning_tokens` greater than `completion_tokens` (observed with Baseten serving reasoning models that hit the length stop mid-reasoning). The text share of completion tokens can never be negative; `total` and `reasoning` remain as reported by the provider.
