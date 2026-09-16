---
'ai': patch
'@ai-sdk/provider': patch
---

Add experimental evaluation model aliases and registry resolution. `customProvider` accepts `evaluationModels`, registries expose `evaluationModel`, and `experimental_evaluate` accepts string IDs when an evaluation-capable default provider is explicitly configured. Evaluation never implicitly falls back to Gateway. Model-resolution errors now identify `evaluationModel` while stable provider contracts remain unchanged.
