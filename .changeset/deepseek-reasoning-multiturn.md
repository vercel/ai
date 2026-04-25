---
"@ai-sdk/deepseek": patch
---

Improve DeepSeek multi-turn conversations by selectively preserving `reasoning_content` for `deepseek-reasoner` (latest user-boundary turn only), and omitting it for `deepseek-chat` to avoid wasted tokens and API errors.
