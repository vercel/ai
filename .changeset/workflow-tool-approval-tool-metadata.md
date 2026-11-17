---
'@ai-sdk/workflow': patch
---

`WorkflowAgent` now passes the tool metadata, dynamic flag, and title defined by the server-side tool to `toolApproval` policies, both for new tool calls and for approved calls replayed from message history. Previously a policy that protects a tool through `toolCall.toolMetadata` could let the tool run, and a policy that no longer requires approval could still see the call as requiring one.
