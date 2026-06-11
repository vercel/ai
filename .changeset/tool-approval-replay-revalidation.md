---
'ai': patch
'@ai-sdk/provider-utils': patch
---

fix(security): re-validate tool approvals from client message history before execution

The approval-replay path in `generateText`/`streamText` reconstructed approved tool calls from the client-supplied messages array and executed them without re-validating input against the tool's schema or re-checking that the tool actually requires approval. A client could forge an assistant message with a pre-approved tool-call part and have the server execute a tool with attacker-chosen arguments.

The replay path now verifies the HMAC signature (when `experimental_toolApprovalSecret` is configured), re-validates tool-call input against the tool's input schema, and re-resolves whether the tool requires approval before execution.
