---
'@ai-sdk/gateway': patch
---

Remove the internal-only `relevance_score` and `citation_number` fields from
published Tako Search response types and schemas. Code that reads either field
must be updated; Gateway responses still pass the values through at runtime,
but they are no longer typed. Also document data surcharge controls.
