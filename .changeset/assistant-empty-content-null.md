---
'@ai-sdk/openai-compatible': patch
'@ai-sdk/openai': patch
---

Use `null` instead of empty string for assistant message `content` when the message contains only tool calls and no text. This fixes a `ValidationException` from AWS Bedrock which rejects empty string content blocks.
