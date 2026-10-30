---
'@ai-sdk/workflow': patch
---

feat(workflow): resume `WorkflowChatTransport` from the stream position the server reports as the SSE event `id`, instead of a count of UI chunks received. The two diverge once a chunk is stored across several durable chunks, which made a resume replay chunks the client already had.
