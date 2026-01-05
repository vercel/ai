---
'ai': patch
---

Add missing `.catch()` handler to `executeToolCall` promise in `runToolsTransformation` to prevent potential stream hang when the promise rejects.
