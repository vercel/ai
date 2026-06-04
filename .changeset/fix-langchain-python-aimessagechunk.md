---
"@ai-sdk/langchain": patch
---

fix(langchain): recognize Python `AIMessageChunk` plain message objects from RemoteGraph streams

Python `langchain-core` serializes streaming message chunks with `type: "AIMessageChunk"`, while TypeScript `langchain-core` uses `type: "ai"`. The `toUIMessageStream` adapter previously only matched the TypeScript form, silently dropping text deltas and tool-call events when streaming from Python LangGraph servers via `RemoteGraph`.
