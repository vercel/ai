---
"@ai-sdk/cohere": patch
---

fix(cohere): emit `source` stream parts for citations

`streamText` did not produce `sources` for Cohere RAG responses because `citation-start` stream events were ignored, while `generateText` mapped `message.citations` to document sources. Streaming now maps each `citation-start` event to the same source part as the non-streaming path.
