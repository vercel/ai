---
'@ai-sdk/cohere': patch
---

fix(cohere): stop requiring `meta` in reranking responses, which failed validation on Zod >= 4.4 when a response omitted it
