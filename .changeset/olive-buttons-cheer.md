---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/open-responses': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/deepinfra': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/alibaba': patch
'@ai-sdk/mistral': patch
'@ai-sdk/openai': patch
'@ai-sdk/google': patch
'@ai-sdk/groq': patch
'@ai-sdk/xai': patch
---

Fix negative `inputTokens.noCache` when providers report cache-exclusive prompt tokens.

Provider converters derived uncached input tokens as `prompt_tokens - cached_tokens` with no floor. Providers that report `prompt_tokens` exclusive of cached tokens made that subtraction underflow, producing a negative `noCache` whenever the cached prefix exceeded the fresh remainder — routine in agentic traffic replaying a long cached context against a handful of new tokens.

Converters now infer the reporting convention instead of assuming it: a cache breakdown larger than the reported total can only mean the reported value already *is* the uncached count, in which case the true total is the sum. Shared as `resolveInputTokenUsage` in `@ai-sdk/provider-utils`, which also generalizes the guard xAI already had.
