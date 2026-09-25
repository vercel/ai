---
'@ai-sdk/openai': patch
---

Support `reasoningEffortUpdate: 'none'` for GPT-6 Sol and Luna in request-level options and positioned system messages. Validate update efforts against the model's supported efforts, warning and omitting unsupported request-level updates and rejecting unsupported historical updates.
