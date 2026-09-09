---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/gateway': patch
'@ai-sdk/provider': patch
'ai': patch
---

Retry unclassified empty image results, preserve retry-attempt accounting, add provider-independent result retryability classification, preserve it through the AI Gateway, and mark Google and Google Vertex content-filtered results as terminal.
