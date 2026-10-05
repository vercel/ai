---
'@ai-sdk/workflow': patch
'ai': patch
---

Add durable non-streaming `WorkflowAgent.generate()` with a shared tool loop, a 20-step default, typed output, and core generation result semantics. Reuse core result and content construction through internal exports while preserving existing Workflow streaming behavior. Transport-independent approval creation remains separate follow-up work.
