---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/alibaba': patch
---

Extract shared `StreamingToolCallTracker` class into `@ai-sdk/provider-utils` to deduplicate streaming tool call handling across OpenAI-compatible providers. Also adds missing `generateId()` fallback for `toolCallId` in Alibaba's `doGenerate` path and ensures all providers finalize unfinished tool calls during stream flush.
