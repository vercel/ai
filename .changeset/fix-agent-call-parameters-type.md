---
'ai': patch
---

Added missing `experimental_onToolCallStart` and `experimental_onToolCallFinish` callback properties to the `AgentCallParameters` type. These callbacks were already supported at runtime (flowing through the rest spread into `generateText`/`streamText`) but caused TypeScript errors when passed to `agent.generate()` or `agent.stream()`.
