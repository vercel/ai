---
'@ai-sdk/react': patch
---

fix(react): prevent double resume in React StrictMode

Added a `hasResumedRef` to track if resume has already been called, preventing duplicate resume requests when React StrictMode double-invokes effects.
