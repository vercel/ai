---
'@ai-sdk/rsc': patch
---

chore (rsc): mark package as ESM and remove leftover dual CJS/ESM publishing artifacts from package.json (`module` field and `module` export condition). The published entrypoints are now `dist/*.js` instead of `dist/*.mjs`.
