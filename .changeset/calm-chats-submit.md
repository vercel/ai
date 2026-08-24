---
'@ai-sdk/angular': patch
---

Avoid deep-cloning chat messages before submission so non-cloneable metadata does not prevent requests.
