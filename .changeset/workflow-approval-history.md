---
'@ai-sdk/workflow': patch
---

`WorkflowAgent` passed the assistant response that contains the tool calls to `toolApproval`, so approval functions saw pending, denied, and invalid sibling calls as if they were completed history. Approval functions now receive only the messages that were sent to the model for the step, without system messages and without the current response, as documented for `generateText` and `streamText`.
