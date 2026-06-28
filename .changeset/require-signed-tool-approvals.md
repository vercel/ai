---
'ai': patch
---

fix(security): require a signed, server-issued approval to execute needsApproval tools (VULN-6698)

Tool approvals are reconstructed from the client-supplied message history. A
client could send a tool part in state `approval-responded` with
`approval.approved: true`, which `convertToModelMessages` expands into a
matching tool-call + approval-request + approval-response — letting the client
forge both sides of the approval and execute any `needsApproval` tool with
in-schema arguments, bypassing the human-in-the-loop gate.

`validateApprovedToolApprovals` now requires every approved approval to carry a
valid HMAC signature bound to `(approvalId, toolCallId, toolName, input)` before
the tool runs. This makes `toolApprovalSecret` mandatory for server-side
approval flows: without it, reconstructed approvals cannot be verified and are
rejected (fail closed) instead of executed.

**Breaking:** server-side tool approval now requires
`experimental_toolApprovalSecret` to be configured on `generateText` /
`streamText`. Approval flows that previously ran without a secret will throw
`InvalidToolApprovalSignatureError` until a secret is set.
