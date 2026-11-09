---
'@ai-sdk/google-vertex': patch
---

Route off-origin MaaS image downloads through the validated download transport so the built-in authentication wrappers in both entry points preserve Node.js DNS validation and manual redirect handling. Explicit custom fetch implementations and the browser redirect fallback remain supported.
