---
'@ai-sdk/openai': patch
---

fix(openai): send content: null instead of empty string for tool-call-only assistant messages. This fixes issues with OpenAI-compatible providers that behave differently with content: "" vs content: null.
