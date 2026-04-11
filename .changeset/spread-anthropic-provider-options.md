---
'@ai-sdk/anthropic': patch
---

Spread message-level `providerOptions.anthropic` (excluding cache control keys) onto assistant messages, enabling custom fields like `reasoning_content` to pass through to the HTTP body.
