---
'@ai-sdk/openai': patch
---

Added support for OpenAI server-side compaction via the `contextManagement` provider option for Responses models. This allows the API to automatically compact conversation history when approaching a specified token threshold, reducing context size without losing important information.
