---
'@ai-sdk/provider-utils': patch
'@ai-sdk/alibaba': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/cohere': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/fireworks': patch
'@ai-sdk/google': patch
'@ai-sdk/groq': patch
'@ai-sdk/minimax': patch
'@ai-sdk/mistral': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/open-responses': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/perplexity': patch
'@ai-sdk/quiverai': patch
'@ai-sdk/xai': patch
---

fix: map the top-level `reasoning` option consistently across providers

Providers now resolve reasoning the same way:

1. A provider-specific reasoning setting in `providerOptions` is sent unchanged. OpenAI no longer drops `providerOptions.openai.reasoningEffort` values that are not in its list for the model, and Fireworks no longer rewrites `providerOptions.fireworks.reasoningEffort`.
2. Otherwise, `reasoning` maps to the closest level the model supports, rounding down, and rounds up only when there is no lower level. For example, `'xhigh'` now maps to `'high'` instead of `'max'` on Anthropic and Bedrock models without `xhigh` effort, and `'medium'` maps to `'low'` instead of `'high'` on DeepSeek, Kimi K3, and Mistral GLM-5.3 models.
3. `'none'` on a model that cannot disable reasoning maps to the model's lowest level with a compatibility warning, instead of being dropped or sending a request the API rejects. This affects GPT-6 models without `'none'`, Groq GPT-OSS, Kimi K3, Perplexity, QuiverAI, Bedrock OpenAI `gpt-oss` models and Anthropic models that always use adaptive thinking, and Gemini 2.5 Pro (minimum thinking budget). Gemini 3 and Anthropic `between_tools` mappings now emit the compatibility warning too.

`mapReasoningToProviderEffort` now accepts any `reasoning` value, returns an optional `providerOptionsEffort` unchanged, and rounds levels that are missing from the effort map to the closest supported level. `mapReasoningToProviderBudget` maps `'none'` to the minimum reasoning budget, always returns a budget, and uses the default percentage for levels missing from `budgetPercentages`. `OpenAICompatibleChatConfig` adds an optional `mapReasoning` function for mapping the top-level `reasoning` option.
