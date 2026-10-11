---
'@ai-sdk/mcp': patch
---

fix: clean up request resources when `transport.send` throws synchronously

`DefaultMCPClient.request` now releases the response handler, abort listener, and timeout timer even when a transport's `send()` method fails by throwing synchronously instead of returning a rejected promise.
