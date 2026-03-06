---
'@ai-sdk/openai': patch
---

fix(openai): accept empty string type field in streaming tool call deltas

Azure and some OpenAI-compatible providers send `type: ""` (empty string) instead of `"function"` in streaming tool call deltas. This caused a TypeValidationError at the Zod schema level, preventing `experimental_repairToolCall` from ever being invoked.

- Changed streaming Zod schema from `z.literal('function').nullish()` to `z.string().nullish()` for tool_calls delta type field
- Updated stream processor to accept empty string alongside null/undefined for tool call type validation

Fixes #6800
