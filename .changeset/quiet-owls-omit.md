---
'@ai-sdk/workflow': patch
---

fix(workflow): omit oversized payloads from WorkflowAgent's writable instead of failing the step

A stream part over the durable stream's size limit, such as a large provider-executed tool result, caused the write to be rejected and the whole model step to fail. WorkflowAgent now replaces oversized tool inputs, outputs, and errors with an `omitted` marker in the stream copy and skips other oversized parts. Step results and the conversation history keep the full value.
