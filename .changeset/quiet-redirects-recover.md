---
'@ai-sdk/tool-web-fetch': patch
---

fix(tool-web-fetch): return a `network_error` result instead of throwing when a redirect has an invalid `Location` header
