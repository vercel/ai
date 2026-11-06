---
'@ai-sdk/provider-utils': patch
---

Reject HTTPS-to-HTTP redirects in validated downloads before requesting the insecure target, including when it matches a configured trusted origin.
