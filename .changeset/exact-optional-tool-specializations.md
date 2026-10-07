---
'@ai-sdk/provider-utils': patch
---

Fix generic tool assignability with `exactOptionalPropertyTypes`. Generic output properties now accept the `undefined` defaults exposed by outputless tools, while concrete output types and their execution requirements remain unchanged.
