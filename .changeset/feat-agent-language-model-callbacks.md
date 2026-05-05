---
'ai': patch
---

Add `experimental_onLanguageModelCallStart` and `experimental_onLanguageModelCallEnd` callbacks to `AgentCallParameters`, `AgentStreamParameters`, and `ToolLoopAgentSettings`. These callbacks fire immediately before and after each provider model call within an agent loop, enabling fine-grained observability (e.g. per-call latency tracking, logging) without needing to use `onStepFinish`.
