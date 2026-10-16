---
'ai': patch
---

Make stream termination safe to repeat across chained transforms. Prevent pending reads from reporting errors after termination and handle rejected inner cancellations during cleanup.
