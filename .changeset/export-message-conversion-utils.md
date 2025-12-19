---
'@ai-sdk/google': patch
'@ai-sdk/anthropic': patch
---

feat(provider/google,anthropic): export message conversion utilities

Export `convertToGoogleGenerativeAIMessages` and `convertToAnthropicMessagesPrompt` functions to enable developers to convert AI SDK messages to provider-specific formats. This is particularly useful for calling token counting APIs (e.g., Gemini's count_tokens, Claude's count_tokens) before making inference calls to check context window limits.
