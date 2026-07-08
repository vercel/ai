---
'@ai-sdk/langchain': patch
---

feat(langchain): add helpers to restore AI SDK UI messages from LangChain messages and LangGraph state snapshots.

The new `baseMessagesToUIMessages` helper converts LangChain message history back
to AI SDK `UIMessage` objects, including tool calls and matching tool results.
The new `stateSnapshotToUIMessages` helper reads LangGraph snapshots and restores
pending human-in-the-loop tool approvals from snapshot interrupts.
