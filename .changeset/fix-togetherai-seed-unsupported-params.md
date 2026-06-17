---
'@ai-sdk/togetherai': patch
---

Fix: omit `seed` from request body when undefined to avoid "Unsupported use of 'seed' parameter" errors from non-diffusion models (e.g. google/gemini-3-pro-image)
