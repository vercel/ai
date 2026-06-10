---
'ai': patch
'@ai-sdk/workflow': patch
---

fix (ai): re-validate tool approvals reconstructed from message history before execution

`collectToolApprovals` rebuilds approved tool calls purely from the messages array, which in the documented `useChat` flow originates from the client. The approval-replay path in `generateText`/`streamText` (and `WorkflowAgent.stream`) previously handed the raw tool-call input straight to `execute()` without re-validating it against the tool's input schema or re-applying the `needsApproval` policy. A client could forge an assistant message with a pre-approved tool-call part and have the server execute a tool with attacker-chosen arguments.

The approval-replay path now mirrors the normal model path: the tool-call input is re-validated against the tool's input schema (rejected fail-closed on mismatch) and the approval policy is re-resolved (a tool the server-side policy denies is not executed, even if the client-supplied approval response claims it was approved).
