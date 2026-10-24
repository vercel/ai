---
'ai': patch
---

fix(ai): keep the provider usage payload when aggregating usage

`addLanguageModelUsage` summed the token counts but left `raw` out, so the
total usage of a call came back without the provider's own usage payload that
each step carried, even though the reference docs list `raw` on the aggregate.
The most recently reported payload is now carried through, and the key stays
absent when no usage reported one.
