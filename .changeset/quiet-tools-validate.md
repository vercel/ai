---
'@ai-sdk/anthropic': patch
---

Add `experimental_validateAnthropicToolSchemas` for checking tool schema roots in build scripts. Reuse the check before Anthropic requests, with an error naming the incompatible tool and how to wrap its schema.
