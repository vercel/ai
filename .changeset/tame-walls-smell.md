---
'@ai-sdk/openai': patch
---

Forward per-message `providerOptions.openai.name` on Chat Completions system, developer, user, and assistant messages. Validate names as strings and warn when configured on unsupported tool messages.
