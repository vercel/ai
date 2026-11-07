---
'@ai-sdk/langchain': patch
---

Prevent duplicate reasoning blocks from LangChain terminal metadata and LangGraph values snapshots, including when streamed reasoning lacks provider block IDs. Preserve reasoning available only in snapshots, including messages with tool calls.
