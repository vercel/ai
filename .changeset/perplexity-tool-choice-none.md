---
'@ai-sdk/perplexity': patch
---

Omit AI SDK function tools from Agent API requests when `toolChoice` is `none`. The Agent API has no tool choice parameter, so the model could still call them.
