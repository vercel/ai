---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): decode base64 into a preallocated Uint8Array to avoid ~25x transient memory and long event-loop blocking on large files
