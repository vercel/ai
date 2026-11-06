---
'@ai-sdk/cohere': patch
---

fix(cohere): tolerate partial citations and usage in non-streaming responses

Cohere citations and usage fields are optional in the API specification, but the
response schema required `start`, `end`, `text`, every source `document` with
`text` and `title`, and usage token counts. Responses with untitled documents
(documents passed without a filename), with tool-sourced citations, or without
token counts failed with an `AI_TypeValidationError` and discarded the whole
response.

These fields are now validated loosely: citation fields and source `type`/`id`
are nullish, `document` is a loose object with optional `id`/`text`/`title`, tool
sources are accepted, and `usage` plus its token counts are nullish. Document
citations without a title fall back to `"Document"`. Tool-only citations are
skipped because they have no document to point at; their data stays in the
response body.

`convertCohereUsage` no longer falls back to `billed_units`, which are a
different measure than `tokens` (e.g. 12 billed vs 507 input tokens in a single
response) and would go negative when cached tokens are subtracted. A response
without `tokens` now reports undefined token counts instead of unrelated
numbers. This usage conversion is shared with streaming.
