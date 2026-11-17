---
'@ai-sdk/langchain': patch
---

fix(langchain): stop `toUIMessageStream` from emitting duplicate reasoning when the final OpenAI Responses chunk repeats the accumulated reasoning, and from re-emitting reasoning of earlier turns in LangGraph values snapshots
