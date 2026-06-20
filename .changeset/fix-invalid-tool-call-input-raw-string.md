---
"ai": patch
---

Wrap malformed tool call input in a JSON object instead of storing the raw string.

When a model returns invalid JSON as tool call input, `parseToolCall` previously stored the raw string as `input`. Providers like Amazon Bedrock require `toolUse.input` to be a JSON object, so the next-step API request would be rejected before the model could see the `tool-error` and retry. The invalid input is now stored as `{ rawInvalidInput: <original string> }`, which keeps the conversation history valid for all providers.
