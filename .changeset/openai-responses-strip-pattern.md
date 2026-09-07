---
"@ai-sdk/openai": patch
---

Fix OpenAI Responses API failures when zod v4 string-format validators (`z.email()`, `z.uuid()`, `z.iso.date()`) emit JSON Schema `pattern` regexes with lookaround. The `pattern` keyword is stripped from tool parameters, tool `output_schema`, and `text.format.schema`; `format` is kept.
