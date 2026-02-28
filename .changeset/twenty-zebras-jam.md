---
'@ai-sdk/xai': patch
---

forward `frequencyPenalty`, `presencePenalty`, and `stopSequences` for supported xai chat models and strip unsupported values from reasoning and `grok-3` requests with unsupported warnings
