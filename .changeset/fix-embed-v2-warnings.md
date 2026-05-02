---
'ai': patch
---

fix(embed): default `warnings` to `[]` when an `EmbeddingModelV2` provider omits the field. Previously `embed()` and `embedMany()` crashed with `TypeError: Cannot read properties of undefined (reading 'length')` (and `result.warnings is not iterable` on the chunked path) when used with v2 embedding providers, because the v2 spec's `doEmbed` return type does not include `warnings`.
