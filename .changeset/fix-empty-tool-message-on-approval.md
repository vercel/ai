---
'ai': patch
---

fix(ai): handle provider-executed tools and tool-approval-response in validation

- Skip validation for tool calls with `providerExecuted: true` (deferred results)
- Map approvalId to toolCallId for proper tool-approval-response handling
- Filter out empty tool messages after content filtering
- Fixes MissingToolResultError for async and approval-based tool flows
