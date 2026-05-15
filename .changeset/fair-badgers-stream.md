---
"@ai-sdk/langchain": patch
"ai": patch
---

fix(langchain): emit text deltas for LangGraph message chunks without ids

fix(ai): request UI message streams with Accept text/event-stream by default, so custom DefaultChatTransport endpoints may now observe SSE negotiation
