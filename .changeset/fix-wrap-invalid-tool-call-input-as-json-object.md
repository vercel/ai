---
'ai': patch
---

Wrap unparseable tool-call input string in a JSON object `{ input: "..." }` instead of propagating a parse error — prevents crashes when a model returns a plain string instead of a JSON object as tool arguments.
