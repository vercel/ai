---
'ai': patch
---

Fix `streamText` return types for reusable options and `ReturnType` by moving low-memory streaming to `experimental_streamTextLowMemory`. Replace experimental `streamText({ experimental_lowMemory: true, ...options })` calls with `experimental_streamTextLowMemory(options)`.
