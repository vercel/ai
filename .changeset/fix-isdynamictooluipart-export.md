---
'ai': patch
---

fix(ai): export isDynamicToolUIPart function

The `isDynamicToolUIPart` function was defined in `ui-messages.ts` but not exported from the package's `index.ts` file. This fix adds the missing export so the function can be used by consumers of the package as documented.