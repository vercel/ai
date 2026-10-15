---
'@ai-sdk/black-forest-labs': patch
---

Fix FLUX 3 Image family requests so Klein forwards resolution tiers and reference images using the supported API fields. Preserve Klein's exact dimensions, seed, output format and steps, validate its dimension limits, and support the documented 0–7 safety tolerance range for FLUX 3 Image models.
