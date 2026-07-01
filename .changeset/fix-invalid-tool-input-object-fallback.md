---
"ai": patch
---

Fix invalid tool call input being stored as a raw string in multi-turn conversations. When a tool call contains JSON that cannot be parsed, the input is now wrapped as `{ rawInvalidInput: string }` instead of storing the raw string directly. This prevents providers such as Amazon Bedrock from rejecting the conversation history on the next turn with a format error.
