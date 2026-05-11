---
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): resolve top-level $ref in Standard Schema JSON Schema output

Standard Schema providers like Effect's Schema.Class can produce JSON Schema with a top-level $ref and $defs. This is valid JSON Schema but some providers reject it for structured output. This fix inlines the referenced definition at the top level. Also handles $defs in additionalProperties processing.
