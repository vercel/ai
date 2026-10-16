---
"@ai-sdk/openai": patch
"@ai-sdk/azure": patch
---

Deprecate `openai.completion()` and `azure.completion()`. These methods now throw an error directing users to `.chat()` or `.responses()` and will be removed in the next major version.
