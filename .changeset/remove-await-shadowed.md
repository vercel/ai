---
'@ai-sdk/codemod': patch
---

fix(codemod): do not remove `await` from calls to a parameter or local binding that shadows the `streamText` / `streamObject` import
