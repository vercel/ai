---
'@ai-sdk/xai': patch
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/mistral': patch
---

fix(xai,groq,deepseek,mistral): send null instead of empty string for content in tool-only assistant messages

When an assistant message contains only tool calls (no text), these providers now
send `content: null` instead of `content: ""`. Several providers (xAI, DeepSeek,
Groq, Mistral) reject requests with `content: ""` on tool-call-only turns.
This matches the fix already applied to the OpenAI provider in #13744.
