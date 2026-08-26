---
'ai': patch
'@ai-sdk/policy-opa': patch
'@ai-sdk/provider-utils': patch
---

Allow manual tool approval statuses to include a reason and preserve it across
core, model, and UI approval requests. OPA `requires-approval` decisions now
surface their reason to human approvers. UI request chunks serialize the
optional `reason`, while UI messages retain it as `approval.requestReason`
separately from an approver's response `reason`.
