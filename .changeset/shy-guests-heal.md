---
"ai": patch
---

- Switches `LangChainStream` helper callback `handler` to return use `handleChainEnd` instead of `handleLLMEnd` so as to work with sequential chains
