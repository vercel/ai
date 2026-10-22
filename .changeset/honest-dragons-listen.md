---
'ai': patch
'@ai-sdk/huggingface': patch
---

Fix `toolChoice: 'none'` by forwarding it to the Hugging Face Responses API and rejecting tool calls before local execution in `generateText` and `streamText` with a new `ToolChoiceViolationError`. Streamed tool parts are withheld so client-side tools cannot act on them, and `experimental_repairToolCall` is not invoked for rejected tool calls.
