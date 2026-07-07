---
'@ai-sdk/workflow': patch
---

`WorkflowChatTransport` now drops orphan UI chunks (deltas/ends and tool output/approval chunks whose part was started before the resumed window) when reconnecting with a negative `initialStartIndex`, instead of crashing the AI SDK client. Self-contained `tool-input-available`/`tool-input-error` chunks establish the tool part and are never dropped. A one-time warning links to docs on rewinding to a step boundary server-side.
