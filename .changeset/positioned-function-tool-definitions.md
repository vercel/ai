---
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/azure': patch
---

Add message-level function tool definitions: OpenAI Responses and Azure support `additionalTools`, and Anthropic `toolChanges` additions support full inline definitions with automatic beta headers. Preserve definitions and controls at their conversation positions during replay. Reject initial Anthropic tool changes instead of silently dropping them.
