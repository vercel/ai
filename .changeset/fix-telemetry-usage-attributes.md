---
'ai': patch
---

fix(telemetry): add missing usage attributes to generateText and generateObject

- Added ai.usage.inputTokens, outputTokens, totalTokens, reasoningTokens, and cachedInputTokens to both step-level and overall telemetry spans
- Matches the attributes already emitted by streamText for consistency
