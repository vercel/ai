---
"@ai-sdk/google": patch
---

fix(provider/google): include `toolUsePromptTokenCount` in input token usage

Google Gemini reports tokens consumed by tool-use prompts (e.g. grounded
Google Search, URL context) in a separate `toolUsePromptTokenCount` field
in `usageMetadata`. These tokens are billed at the regular input rate but
were previously dropped: they were not declared in `usageSchema` and the
converter only summed `promptTokenCount` into `inputTokens.total`.

The result was that grounded calls under-reported input tokens by the
exact amount Google billed for the tool-use prompts (in one repro: 79
of 401 total tokens, ~20%, were missing from `usage.inputTokens`).

This change adds `toolUsePromptTokenCount` to the schema and includes it
in `inputTokens.total` and `inputTokens.noCache`. Non-grounded calls are
unaffected.
