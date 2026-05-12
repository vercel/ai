---
"@ai-sdk/deepseek": patch
---

Align DeepSeek `providerOptions` schema with DeepSeek's API: accept `thinking.type: 'adaptive'` and expand `reasoningEffort` to `'high' | 'low' | 'medium' | 'max' | 'xhigh'`. Top-level `reasoning: 'low' | 'medium'` now passes through to DeepSeek's native `low`/`medium` effort values (previously collapsed to `'high'` with a compatibility warning); `reasoning: 'minimal'` maps to `'low'`. Fixes pre-flight `AI_InvalidArgumentError: invalid deepseek provider options` for payloads DeepSeek's API would otherwise accept.
