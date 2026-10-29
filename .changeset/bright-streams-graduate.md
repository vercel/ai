---
'ai': patch
---

feat(ai): graduate `experimental_transform` to `transform`

`streamText`, `Agent.stream()`, `ToolLoopAgent.stream()`, `createAgentUIStream`, `createAgentUIStreamResponse`, and `pipeAgentUIStreamToResponse` now accept `transform`. `experimental_transform` remains as a deprecated alias.
