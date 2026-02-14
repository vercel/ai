---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/anthropic': patch
---

Add top-level `thinking` call settings to the V3 language model spec and map them across providers.

- Added `thinking` to `LanguageModelV3CallOptions` and AI SDK call settings with runtime validation.
- Forwarded `thinking` through `generateText`, `streamText`, `generateObject`, `streamObject`, and `ToolLoopAgent`.
- Mapped top-level `thinking` to OpenAI chat/responses and OpenAI-compatible `reasoning_effort`.
- Mapped top-level `thinking` to Anthropic thinking configuration and effort output settings.
- Added regression tests for forwarding, precedence, and unsupported budget warnings.
