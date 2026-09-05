---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/provider': patch
'ai': patch
---

Retry unclassified empty image results, preserve retry-attempt accounting, add provider-independent result retryability classification, and mark Google and Google Vertex prompt blocks as terminal.
