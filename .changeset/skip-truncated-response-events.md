---
"@ai-sdk/openai": patch
---

fix(provider): skip truncated `response.*` SSE events that fail JSON parsing, preventing stream crashes during ChatGPT Codex OAuth responses
