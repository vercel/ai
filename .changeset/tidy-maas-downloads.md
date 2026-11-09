---
'@ai-sdk/google-vertex': patch
---

Route off-origin MaaS image downloads through the validated download transport so the built-in authentication wrapper preserves Node.js DNS validation and manual redirect handling. Explicit custom fetch implementations remain supported.
