---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): keep object branches of an `allOf` open when adding `additionalProperties: false` to a Standard Schema's JSON Schema. Closing every branch made the intersection unsatisfiable, so a value that passed the original schema failed the schema sent to the provider. Objects nested inside a branch are still closed.
