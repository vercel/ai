---
'@ai-sdk/google': patch
---

fix(google): reject structured output schemas in batch requests because inline Google batch requests ignore `responseJsonSchema`
