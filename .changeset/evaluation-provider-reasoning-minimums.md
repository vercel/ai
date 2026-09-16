---
'@ai-sdk/openai': patch
'@ai-sdk/google': patch
'@ai-sdk/anthropic': patch
---

Define `reasoning: 'none'` as disabling thinking where supported, otherwise requesting the lowest supported effort or budget. Implement model-specific fallbacks in OpenAI Chat/Responses, Anthropic Messages, and Google GenerateContent, including the language-model evaluation adapters that default to `none`.

Use model-family defaults so newer versions inherit the latest known behavior, while retaining exceptions for older models. Preserve explicit provider reasoning controls, omitted reasoning, and `provider-default`. Google explicit thinking budgets or levels suppress shared derivation to avoid conflicting controls; display-only options still allow shared reasoning. Gemini Pro also maps shared `minimal` to its supported minimum level, `low`.

Fallbacks can consume reasoning tokens and change output and usage. OpenAI Responses retains its existing `detailed` summary default for non-`none` effort; set `reasoningSummary: null` to omit summaries. Custom model IDs retain existing provider behavior when their underlying family cannot be inferred.
