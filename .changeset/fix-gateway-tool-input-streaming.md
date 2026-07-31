---
'@ai-sdk/gateway': patch
---

fix(gateway): preserve incremental tool input streaming for streaming language model calls

Gateway streaming language model requests now send `Accept: text/event-stream`
so upstream SSE tool input deltas are forwarded incrementally instead of being
buffered until long JSON string values complete.
