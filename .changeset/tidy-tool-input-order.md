---
'ai': patch
---

Fix streamed tool input callbacks firing out of order on newer Node.js versions by awaiting start and delta callbacks before invoking `onInputAvailable`.
