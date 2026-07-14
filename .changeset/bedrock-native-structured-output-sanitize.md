---
"@ai-sdk/amazon-bedrock": patch
"@ai-sdk/anthropic": patch
---

Sanitize native structured-output schemas for Anthropic models on Bedrock, and fall back to the tool-based JSON path when a schema exceeds Bedrock's compilation limits. Previously `output_config.format.schema` forwarded the schema unchanged, so unsupported validation keywords (`minimum`/`maximum`, `minLength`/`pattern`, `minItems`/`maxItems`, etc.) returned a 400, and complex schemas exceeded the union-typed (16) and optional (24) parameter limits. The native path now reuses the Anthropic `sanitizeJsonSchema` helper (constraints move to field descriptions; the original schema still validates results client-side) and routes over-limit schemas to the tool-based path, which has no such limits. `sanitizeJsonSchema` is exported from `@ai-sdk/anthropic/internal`.
