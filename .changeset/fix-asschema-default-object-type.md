---
"@ai-sdk/provider-utils": patch
---

fix(provider-utils): include `type: "object"` in the default JSON schema returned by `asSchema(null | undefined)`

The default schema returned when no `inputSchema` is provided on a tool previously omitted the `type` field. OpenAI's API was lenient and accepted it, but stricter OpenAI-compatible providers (e.g. GitHub Copilot's `/chat/completions` endpoint) reject the schema with errors like `schema must be a JSON Schema of 'type: "object"', got 'type: "None"'`. Adding `type: "object"` to the default makes the schema spec-conformant and unblocks tool use against strict providers.
