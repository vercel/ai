---
'ai': patch
---

fix(ai): make experimental_context required in ToolLoopAgentOnFinishCallback

This fixes a type inconsistency where `ToolLoopAgentOnFinishCallback` had `experimental_context` as optional while `StreamTextOnFinishCallback` and `GenerateTextOnFinishCallback` had it as required. Since `ToolLoopAgent` delegates to `streamText`/`generateText`, and both always pass `experimental_context` when invoking the callback, the types should match.
