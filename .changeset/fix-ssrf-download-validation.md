---
'@ai-sdk/provider-utils': patch
'ai': patch
---

Add URL validation to `download` to prevent blind SSRF attacks. Private/internal IP addresses, localhost, and non-HTTP protocols are now rejected before fetching.
