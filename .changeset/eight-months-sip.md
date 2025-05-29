---
'@ai-sdk/provider-utils': patch
'ai': patch
---

feat: support for zod v4 for schema validation

All these methods now accept both a zod v4 and zod v3 schemas for validation:

- `generateObject()`
- `streamObject()`
- `generateText()`
- `experimental_useObject()` from `@ai-sdk/react`
- `streamUI()` from `@ai-sdk/rsc`
