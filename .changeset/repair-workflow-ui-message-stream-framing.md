---
"@ai-sdk/workflow": patch
---

`WorkflowChatTransport` now repairs UI message stream part framing, so duplicated or interleaved durable stream writes no longer crash the AI SDK consumer with `Received text-delta for missing text part`.
