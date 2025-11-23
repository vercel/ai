---
'ai': patch
'@ai-sdk/provider-utils': patch
---

feat(ai): add writeSource callback to tool execute options for RAG sources

Tools can now write sources directly to the stream using the writeSource callback in the execute function's second argument, eliminating the need for manual stream creation and writer wrapping in RAG use-cases.
