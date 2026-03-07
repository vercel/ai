---
'@ai-sdk/anthropic': patch
---

fix(anthropic): convert oneOf to anyOf in tool and output_format schemas

The Anthropic API rejects schemas that contain `oneOf`
(`output_format.schema: Schema type 'oneOf' is not supported`).
Zod's `z.discriminatedUnion()` produces `oneOf` when serialised to JSON
Schema, which caused failures when using discriminated unions as tool
`inputSchema` or as an `output_format` schema with structured output.

Adds a `replaceOneOfWithAnyOf` helper that recursively rewrites every
`oneOf` keyword to `anyOf` before the schema is sent to the API. The
conversion is applied to:

- function tool `input_schema` (in `prepareTools`)
- native `output_format.schema` (structured output path)

Fixes #12876
