---
'ai': patch
---

fix(ai): accept per-call `runtimeContext` and `toolsContext` in `ToolLoopAgent.generate()` and `stream()`. A call-level value overrides the constructor-level value for that call.
