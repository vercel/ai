---
'@ai-sdk/harness': patch
---

fix(harness): keep durable sessions replayable when a tool result contains prototype-sensitive keys

A host tool can return JSON from an untrusted source, such as an HTTP response, that contains own `__proto__` or `constructor.prototype` keys. The durable log and stream stored such values verbatim, but replay reads them with the secure JSON parser, which rejects those keys. One such tool result then made every later read and replay of the session fail permanently. Durable records now store a value that the replay parser would reject as a JSON string inside the record, so the session stays replayable and the value is preserved.
