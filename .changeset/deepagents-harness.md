---
'@ai-sdk/harness-deepagents': patch
---

Add `@ai-sdk/harness-deepagents`, a HarnessV1 adapter for LangChain's LangGraph-based DeepAgents runtime. The bridge-backed adapter runs a Node bridge inside the sandbox (driving the `deepagents` npm package via `createDeepAgent` + `streamEvents`, on the shared `@ai-sdk/harness/bridge` transport) and supports single- and multi-turn-within-session prompts, host-executed tools, skills, and the `read`/`write`/`bash`/`grep` built-ins.
