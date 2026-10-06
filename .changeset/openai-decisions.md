---
'@ai-sdk/openai': patch
---

Replace the OpenAI structured-output wrapper for `decide` with the native Decisions API. Only `gpt-6-luna` is currently supported by this endpoint; other Responses models no longer work with `openai.decisionModel()` or its deprecated `evaluationModel()` alias.

Responses API options, such as `reasoningEffort`, are no longer applied and produce unsupported-option warnings. The Decisions API supports `providerOptions.openai.safetyIdentifier`. Native token usage and confidence values are preserved, and per-question refusals fail the decision call.
