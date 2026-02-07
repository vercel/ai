---
'@ai-sdk/openai-compatible': patch
---

Support tool-level provider options in OpenAI-compatible provider. Tools can now include custom provider metadata through the `providerOptions` field, which gets properly merged into the prepared tools for API requests.
