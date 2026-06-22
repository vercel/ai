---
'@ai-sdk/workflow': patch
---

fix (workflow): forward provider-executed tool approvals to the provider on resume

`WorkflowAgent` stripped every `tool-approval-request` and `tool-approval-response` part from the messages when resuming after a tool approval, regardless of whether the tool was locally or provider-executed. For provider-executed tools (e.g. MCP via the OpenAI Responses API) this silently dropped the approval before `convertToLanguageModelPrompt` could forward it, so the provider never learned of the approval and the tool was never executed. Local approvals are still executed and stripped, while provider-executed approvals are now preserved and forwarded to the provider, matching the discriminator core's `streamText` already uses. This is the inverse of the bug fixed in #14289.
