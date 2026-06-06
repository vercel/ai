---
'ai': patch
---

fix (ai): `fixJson` now drops incomplete `\uXXXX` unicode escape sequences instead of producing invalid JSON

When a streamed JSON value was truncated in the middle of a unicode escape (e.g. `{"a":"\u12`), `fixJson` previously closed the string off as `{"a":"\u12"}`, which is invalid JSON. `parsePartialJson` then returned `failed-parse` and the partial value was dropped for that chunk. The repaired output is now valid JSON (`{"a":""}`), so partial values continue to stream through.
