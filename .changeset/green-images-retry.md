---
'@ai-sdk/gateway': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/provider': patch
'ai': patch
---

Retry unclassified empty image results, preserve completed-attempt diagnostics, add provider-independent result retryability classification, preserve it through the AI Gateway, and mark Google Vertex RAI-filtered results as terminal.
