---
"@ai-sdk/amazon-bedrock": patch
"@ai-sdk/anthropic": patch
---

fix (provider/amazon-bedrock): sanitize native structured-output schemas and fall back to the tool-based JSON path when a schema exceeds Bedrock's union-parameter limit

Bedrock's native structured output (`output_config.format.schema`) forwarded the schema unchanged, so schemas with unsupported validation keywords (`minimum`/`maximum`, `minLength`/`pattern`, `minItems`/`maxItems`, etc.) 400'd, and large schemas exceeded the "16 parameters with unions" limit. The native path now reuses the Anthropic `sanitizeJsonSchema` helper (constraints are moved to descriptions; the original schema still validates results client-side) and automatically routes schemas with more than 16 union-typed parameters to the tool-based JSON path, which has no such limit. `sanitizeJsonSchema` is now exported from `@ai-sdk/anthropic/internal`.
