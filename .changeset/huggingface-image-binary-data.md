---
'@ai-sdk/huggingface': patch
---

Base64-encode binary image file data instead of stringifying the bytes, so images passed as Uint8Array produce valid data URLs.
