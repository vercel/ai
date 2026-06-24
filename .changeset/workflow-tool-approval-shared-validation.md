---
'@ai-sdk/workflow': patch
'ai': patch
---

fix(workflow): reuse the core tool-approval validation in WorkflowAgent

`WorkflowAgent.stream` previously reconstructed approved tool calls with a copy of the core collection logic and validated them inline. Because the logic was duplicated, it could drift from the hardened `generateText`/`streamText` implementation. WorkflowAgent now collects approvals via the shared `collectToolApprovals` and re-validates each one through the shared `validateApprovedToolApprovals` (input-schema re-validation, HMAC signature verification when configured, and approval-policy re-resolution) in addition to its existing `needsApproval` guard, so a client-forged approval cannot execute a tool with unvalidated input. The duplicated collector was removed; `collectToolApprovals` and `validateApprovedToolApprovals` are now exported from `ai/internal`.
