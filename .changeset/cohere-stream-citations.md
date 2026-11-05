---
"@ai-sdk/cohere": patch
---

fix(cohere): emit `source` stream parts for citations

`streamText` did not produce sources for Cohere RAG responses because `citation-start` stream events were ignored, while `generateText` mapped `message.citations` to document sources. Streaming now maps each cited document to the same `source` part as the non-streaming path. Citations that only reference tool output are not emitted as sources, and `citation-start` events without citations are ignored.
