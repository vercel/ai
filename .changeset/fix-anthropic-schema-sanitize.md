---
"@ai-sdk/anthropic": patch
---

fix: sanitize unsupported JSON Schema keywords in Anthropic structured output schemas

Anthropic's `output_config.format.schema` strictly rejects unsupported JSON Schema keywords (e.g. `exclusiveMinimum`, `minimum`, `maximum`, `not`, `pattern`), unlike tool schemas where they are silently ignored. This caused valid Zod schemas like `z.number().positive()` to produce 400 errors when used with structured outputs.

Added a `sanitizeJsonSchema` function that recursively strips unsupported validation-only keywords before passing the schema to the API.
