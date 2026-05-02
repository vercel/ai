---
"@ai-sdk/workflow": patch
---

fix (workflow): preserve `tool-approval-request` and `tool-approval-response` parts for provider-executed tools so the provider receives the approval on resume

`WorkflowAgent` previously stripped all approval parts from messages when handling tool-approval responses, regardless of whether the approved tool was locally or provider-executed. For provider-executed tools (e.g. MCP via the Responses API) this silently dropped the approval, leaving the provider to never receive it and the tool to never execute. The fix mirrors the inverse of #14289: locally-executed approvals are still executed and stripped here, while provider-executed approvals are left intact in the messages so the next provider call can process them.
