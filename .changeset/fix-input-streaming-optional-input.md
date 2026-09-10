---
"ai": patch
---

fix(ui): drop the redundant `| undefined` from the already-optional `input` field on the `input-streaming` `UIToolInvocation` variant so the type matches the runtime validator (`z.unknown().optional()`)
