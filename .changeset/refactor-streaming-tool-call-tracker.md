---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/alibaba': patch
---

refactor: extract StreamingToolCallTracker to deduplicate streaming tool call handling

Extracts shared streaming tool call state management into a reusable `StreamingToolCallTracker` class in `@ai-sdk/provider-utils`. This removes ~500 lines of duplicated code across 5 OpenAI-compatible providers (openai, openai-compatible, groq, deepseek, alibaba).

Also fixes missing `generateId()` fallback for `toolCallId` in the Alibaba provider's `doGenerate` path.
