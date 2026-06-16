---
"@ai-sdk/gateway": patch
---

fix(gateway): encode inline v4 file part bytes as { type: 'data' } instead of a data: URL
