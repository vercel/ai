---
'@ai-sdk/codemod': patch
---

fix(codemod): alias non-z default imports in v5/replace-zod-import-with-v3

The `v5/replace-zod-import-with-v3` transform converted every default import of `zod` into a named import using the local name as the export name. A default import like `import validator from 'zod'` therefore became `import { validator } from 'zod/v3'`, but `validator` is not an export of `zod/v3`, breaking the migrated module. Default imports of `zod` now become `import { z as <local> } from 'zod/v3'`, preserving the original local name.
