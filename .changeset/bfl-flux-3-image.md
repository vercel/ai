---
'@ai-sdk/black-forest-labs': patch
---

Add FLUX 3 image generation and editing support with resolution, grounding, and version options. Handle reasoning and generating poll statuses, stop on terminal task failures, and download signed image URLs without API credentials.

Normalize size-derived aspect ratios to the accepted FLUX 3 values and omit unsupported ratios with a warning. Preserve provider and request headers for image downloads on a custom base URL's origin.
