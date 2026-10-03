---
'@ai-sdk/gateway': patch
---

Fix cross-environment base64 encoding by replacing Node.js-specific Buffer usage with convertUint8ArrayToBase64 utility
