---
'@ai-sdk/workflow': patch
---

fix (workflow): mark package as ESM so the published files match the `main`, `types`, and `exports` entrypoints in package.json. Previously `require('@ai-sdk/workflow')` failed with `MODULE_NOT_FOUND` because the declared CommonJS entrypoints were never published.
