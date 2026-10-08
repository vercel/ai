---
'ai': patch
---

Fix streaming output timeouts: stop `chunkMs` and `firstChunkMs` when the model response ends, so long-running local tools do not trigger model output timeouts. Give each retry fresh output timeout budgets. `firstChunkMs` continues to start after the provider returns its stream, excluding request setup. `stepMs` continues to cover the complete step, including local tools.
