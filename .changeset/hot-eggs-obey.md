---
'@ai-sdk/openai-compatible': patch
---

Allow passing config to chat models; Refine the `stream_options` handling in `OpenAICompatibleChatLanguageModel` to correctly omit the `stream_options` field when `includeUsage` is false/undefined, preventing `undefined` from being sent in the request body.
