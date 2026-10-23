---
'@ai-sdk/google': patch
---

fix(google): convert a single nullable type array to a plain nullable node

`type: [X, "null"]` now converts to `type: X, nullable: true` instead of `anyOf: [{type: X}], nullable: true`, so keywords beside it (`items`, `format`) stay valid. Gemini rejected the old shape on Vertex ("other fields alongside any_of") and AI Studio (`items` on a non-array node).
