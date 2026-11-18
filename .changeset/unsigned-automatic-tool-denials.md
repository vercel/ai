---
'ai': patch
---

With `experimental_toolApprovalSecret` configured, `generateText` and `streamText` signed the approval request of a tool call that the tool approval policy had denied automatically. A client that controls the message history could send that request back with an approved response and have the denied tool call executed. Approval requests of automatically denied tool calls are no longer signed, so such a response is rejected with `AI_InvalidToolApprovalSignatureError`.
