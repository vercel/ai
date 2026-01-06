---
'@ai-sdk/openai-compatible': patch
'@ai-sdk/openai': patch
'ai': patch
---

Add support for URL-based image responses in `generateImage()`. When image-generation endpoints return images as URLs instead of base64-encoded strings, `generateImage()` now automatically detects and downloads them, converting them to `GeneratedFile` format. Added `experimental_download` parameter for custom download handling (authentication, retries, caching, etc.).
