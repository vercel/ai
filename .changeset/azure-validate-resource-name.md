---
'@ai-sdk/azure': patch
---

Reject an Azure `resourceName` that is not a single DNS label, so a malformed value cannot rewrite the request host.
