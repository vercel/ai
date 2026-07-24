---
'@ai-sdk/anthropic': patch
---

feat (provider/anthropic): support fallbacks 'default' mode, which routes safety classifier refusals to Anthropic's recommended fallback model (adds the server-side-fallback-2026-07-01 beta automatically)
