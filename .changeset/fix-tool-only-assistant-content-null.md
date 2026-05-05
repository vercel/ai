---
'@ai-sdk/xai': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/groq': patch
'@ai-sdk/mistral': patch
---

Send `null` content (instead of empty string) for tool-only assistant messages — fixes strict API validation errors from xAI, DeepSeek, Groq, and Mistral when an assistant turn contains only tool calls.
