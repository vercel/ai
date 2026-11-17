---
'@ai-sdk/google': patch
---

fix(google): reject structured output schemas in batch requests because the Google batch endpoint ignores `responseJsonSchema`
