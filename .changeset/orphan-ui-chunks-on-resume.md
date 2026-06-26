---
'@ai-sdk/workflow': patch
---

`WorkflowChatTransport` now drops orphan UI chunks (deltas/ends with no matching `*-start` in the resumed window) when reconnecting with a non-zero `initialStartIndex`, instead of crashing the AI SDK client. A one-time warning links to docs on rewinding to a step boundary server-side.
