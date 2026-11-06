---
'@ai-sdk/anthropic': patch
'@ai-sdk/anthropic-aws': patch
---

Refactor Anthropic AWS model ID logic into a model catalog that declares capabilities and provider options, and generate provider capability documentation from it. Export Anthropic catalog metadata internally for Anthropic AWS to reuse. Request behavior is unchanged.
