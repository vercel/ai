---
'@ai-sdk/moonshotai': patch
---

Avoid repeatedly normalizing array item schemas when preparing Moonshot tool and response schemas. Normalize object items and rewritten tuple items once while preserving existing prefix item order.
