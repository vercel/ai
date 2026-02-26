---
'@ai-sdk/openai': patch
---

fix(openai): include reasoning parts without itemId when encrypted_content is present

When `providerOptions.openai.itemId` is absent on a reasoning content part,
the converter now uses `encrypted_content` as a fallback instead of silently
skipping the part with a warning. The OpenAI Responses API accepts reasoning
items without an `id` when `encrypted_content` is supplied, enabling
multi-turn reasoning even when item IDs are stripped from provider options.

Also makes the `id` field optional on the `OpenAIResponsesReasoning` type to
reflect that the API does not require it.

Fixes #12853
