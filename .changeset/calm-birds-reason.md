---
'@ai-sdk/langchain': patch
---

Prevent duplicate reasoning blocks in LangGraph `toUIMessageStream` streams from terminal metadata and values snapshots, including when streamed reasoning lacks provider block IDs. Preserve reasoning available only in snapshots, including messages with tool calls.
