---
'@ai-sdk/google': patch
---

fix(google): convert `type: [X, "null"]` to a plain nullable node so `items` and `format` beside it stay valid for Gemini
