---
'ai': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/workflow': patch
---

Fix `toolChoice: 'none'` by forwarding it to the Hugging Face Responses API and rejecting tool calls before local execution in `generateText`, `streamText`, and `WorkflowAgent`. Streamed tool parts are withheld so client-side tools cannot act on them, and `repairToolCall` and `experimental_refineToolInput` are not invoked for rejected tool calls.
