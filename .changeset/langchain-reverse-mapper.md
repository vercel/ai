---
'@ai-sdk/langchain': patch
---

Add `baseMessagesToUIMessages` and `stateSnapshotToUIMessages`: reverse of `toBaseMessages` for restoring threads (e.g. from a LangGraph checkpointer) into `useChat` `initialMessages`. Closes #12680.
