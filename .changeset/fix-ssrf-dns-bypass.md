---
'@ai-sdk/provider-utils': patch
'ai': patch
---

Fix SSRF bypass via DNS resolution: add missing private IPv4 ranges and validate resolved IP addresses to prevent DNS-based SSRF attacks where hostnames resolve to private/internal IPs.
