---
'@ai-sdk/provider-utils': patch
'@ai-sdk/gateway': patch
'@ai-sdk/google': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/langchain': patch
---

Harden production JSON parsing against prototype pollution by using `secureJsonParse` instead of `JSON.parse` on untrusted input.
