---
"@ai-sdk/langchain": patch
---

Surface LangChain citation annotations as spec-compliant `source-url` / `source-document` UI message parts. Previously, citations attached to text content blocks (e.g. from web search or RAG) were dropped entirely instead of being emitted as AI SDK source parts. Citation metadata (`citedText`, `startIndex`, `endIndex`, `source`) is preserved under `providerMetadata.langchain`.
