---
'@ai-sdk/anthropic': patch
---

fix(anthropic): handle missing documentInfo in createCitationSource gracefully

When `citationDocuments[citation.document_index]` returns `undefined` (e.g. document index out of bounds), the citation was silently dropped. Now provides fallback values (`text/plain` mediaType, `Unknown document` title) so citations are preserved.
