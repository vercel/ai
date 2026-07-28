---
'@ai-sdk/provider-utils': patch
'ai': patch
---

Prevent validated downloads on Node.js from reaching private or internal services through DNS aliases or DNS rebinding by validating and pinning every resolved address at connection time.
