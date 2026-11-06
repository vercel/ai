---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Refactor Google Vertex model ID logic into a model catalog that declares capabilities and provider options, and generate provider capability documentation from it. Export Google catalog metadata internally for Vertex to reuse. Request behavior is unchanged.
