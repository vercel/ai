---
'@ai-sdk/openai': patch
'@ai-sdk/gateway': patch
'@ai-sdk/provider-utils': patch
---

fix: strip JSON Schema keywords OpenAI's strict tool schemas reject

OpenAI's Responses API defaults function tools to `strict: true` and only
supports a subset of JSON Schema. Keywords like `minItems`/`maxItems`,
`minLength`/`maxLength`, `pattern`, `format`, and `minimum`/`maximum` can make
OpenAI fail with a generic in-stream `server_error` on gpt-5.x models while it
compiles the schema into a constrained-decoding grammar. This is what the
default Zod v4 conversion produces for common schemas (e.g.
`z.array(z.string()).min(1).max(30000)`), so AI SDK users hit it without
writing any problematic schema themselves.

Adds a shared `sanitizeJsonSchema` util that strips the OpenAI-unsupported
keywords (folding their values into the schema `description` as guidance) and
applies it to function tool schemas in `@ai-sdk/openai` (Responses and chat
completions) and to requests routed to OpenAI through `@ai-sdk/gateway`. The
full original schema is still used for SDK-side tool input validation.
