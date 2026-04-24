---
"@ai-sdk/provider-utils": patch
"ai": patch
---

Add support for extra data in tool approval responses with typed schema.

- Added `data` field to `ToolApprovalResponse` type for passing extra data with approval responses
- Added `approvalData` field to `ToolExecutionOptions` so the approval data is available in tool `execute` functions
- Added `approvalDataSchema` field to `Tool` type for defining the schema of approval data with full type inference
- Added `APPROVAL_DATA` type parameter to `Tool`, `ToolExecutionOptions`, and `ToolExecuteFunction` types
- Added `InferToolApprovalData` helper type for inferring the approval data type from a tool
- Updated `ChatAddToolApproveResponseFunction` to accept a `data` parameter
- Updated `UIToolInvocation` approval object to include optional `data` field

This allows users to pass additional information when approving tool calls (e.g., user notes, selected options, confirmation details) that can then be used during tool execution with full type safety.
