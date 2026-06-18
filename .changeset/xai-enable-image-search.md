---
'@ai-sdk/xai': patch
---

feat(provider/xai): add `enableImageSearch` to the xAI Web Search tool

The xAI Responses API supports `enable_image_search` on Web Search tools. `xai.tools.webSearch()` now accepts `enableImageSearch` and sends it through to the API as `enable_image_search`.
