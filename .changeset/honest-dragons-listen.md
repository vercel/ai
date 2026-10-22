---
'ai': patch
'@ai-sdk/huggingface': patch
---

Fix `toolChoice: 'none'` by forwarding it to the Hugging Face Responses API and rejecting tool calls before local execution in `generateText` and `streamText`.
