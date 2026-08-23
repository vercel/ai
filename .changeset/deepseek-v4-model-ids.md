---
'@ai-sdk/deepseek': patch
---

fix(provider/deepseek): replace the discontinued `deepseek-chat` and `deepseek-reasoner` model ids with `deepseek-v4-flash` and `deepseek-v4-pro`. DeepSeek retired both legacy names on 2026-07-24, and only the two V4 ids are documented and accepted by the Responses API. Any other id can still be passed as a plain string.
