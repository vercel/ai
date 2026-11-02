---
'ai': patch
---

fix(ai): enforce server-side tool approval denials on replayed approvals. The approval policy is now re-run on a tool call that is rebuilt from the server's tool definition (`toolMetadata`, `dynamic`, `title`) instead of the client-supplied history, and automatically denied approval requests are no longer signed with `experimental_toolApprovalSecret`, so a denial can no longer be replayed with `approved` flipped to `true`.
