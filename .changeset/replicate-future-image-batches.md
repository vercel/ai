---
'@ai-sdk/replicate': patch
---

Default unknown image models to eight images per call instead of capping every new model at one. Known legacy models, including pinned versions, retain their existing single-image batch limit.
