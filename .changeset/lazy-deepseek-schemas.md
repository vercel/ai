---
'@ai-sdk/deepseek': patch
---

Defer DeepSeek validation schema creation until first use and cache shared schemas while preserving the internal Zod object exports.
