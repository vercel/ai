---
'@ai-sdk/deepseek': patch
---

feat(provider/deepseek): add Responses API support. `deepSeek.responses(modelId)` creates a model backed by DeepSeek's Responses API, which is served from the same base URL as Chat Completions and is the only DeepSeek API that exposes DeepSeek's server-side tools. `deepSeek(modelId)`, `deepSeek.languageModel(modelId)` and `deepSeek.chat(modelId)` keep using Chat Completions, so existing code is unaffected. On the Responses API models, thinking is controlled with the `reasoningEffort` provider option, where `none` turns it off, or with the top-level `reasoning` setting.
