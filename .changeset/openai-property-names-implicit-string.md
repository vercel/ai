---
'@ai-sdk/openai': patch
---

fix(openai): strip `propertyNames` schemas that omit `type: 'string'` (e.g. Zod 3 records with constrained keys) instead of throwing an unsupported functionality error
