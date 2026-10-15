---
'@ai-sdk/black-forest-labs': patch
---

Default unknown image model IDs to the latest supported FLUX image API, currently FLUX 3 Image Klein, while retaining older families' request formats and the original FLUX 3 Image controls. Forward resolution tiers and reference images using the supported API fields, preserve exact dimensions, seed, output format and steps, and support the documented 0–7 safety tolerance range for FLUX 3 Image models.
