---
'@ai-sdk/langchain': patch
---

Only finalize the pending messages of a subgraph's namespace (and the graphs nested under it) on a namespaced LangGraph `values` event. With `subgraphs: true`, a snapshot from one subgraph no longer ends another subgraph's in-flight text or emits its tool call with partial arguments.
