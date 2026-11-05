---
'@ai-sdk/cohere': patch
---

fix(cohere): tolerate partial citations and usage in non-streaming responses

Cohere citations and usage fields are optional in the API specification, but the
response schema required `start`, `end`, `text`, every source `document` with
`text` and `title`, and usage token counts. Responses with untitled documents
(documents passed without a filename), with tool-sourced citations, or with a
missing usage block failed with an `AI_TypeValidationError` and discarded the
whole response. These fields are now validated loosely, tool-sourced citations
no longer produce document sources, and usage falls back to `billed_units` when
`tokens` is absent.
