---
'@ai-sdk/google': patch
---

fix (provider/google): include `toolUsePromptTokenCount` in input token usage

Gemini reports tokens consumed by tool-use prompts — most commonly grounded
Google Search or URL context — in a separate `toolUsePromptTokenCount` field in
`usageMetadata`, on top of `promptTokenCount`. Both are billed at the regular
input rate, but the provider previously dropped this field: it was not declared
in `usageSchema` (so zod stripped it) and `convertGoogleUsage` only summed
`promptTokenCount` into `inputTokens.total`. Grounded calls therefore
under-reported input tokens by the exact amount Google billed for the tool-use
prompt. This adds the field to the schema and includes it in `inputTokens.total`
and `inputTokens.noCache`; non-grounded calls are unaffected.
