---
'@ai-sdk/google': patch
---

Preserve `minItems`, `maxItems`, `minimum`, `maximum`, and `maxLength` JSON Schema properties when converting to OpenAPI schema for Google Generative AI. These properties are supported by the Gemini API but were previously silently dropped during schema conversion, preventing users from enforcing array length and numeric range constraints in structured outputs.
