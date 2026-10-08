---
'ai': patch
---

Fix streaming output timeouts: stop `chunkMs` and `firstChunkMs` when the model response ends, so long-running local tools do not trigger model output timeouts. Start `firstChunkMs` when the provider streaming call is invoked, including request setup, and give each retry fresh output timeout budgets. `stepMs` continues to cover the complete step, including local tools.
