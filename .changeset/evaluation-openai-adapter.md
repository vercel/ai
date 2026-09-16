---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
---

Add experimental Choice and Score evaluations through `openai.evaluationModel()` and a shared structured language-model evaluation adapter. Preserve exact labels and metadata, validate score bounds, and reject unsupported Boolean questions before sending a request.
