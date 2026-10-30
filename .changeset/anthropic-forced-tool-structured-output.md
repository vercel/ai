---
"@ai-sdk/anthropic": patch
---

fix(anthropic): use native structured outputs for Claude models that reject forced tool use (Sonnet 5.5, Opus 5.5, Fable 5.1) even when the provider disables them by default, as Amazon Bedrock and Google Vertex do. Self-referencing schemas keep the JSON response tool. Also keep `definitions` and `$defs` next to a top-level `$ref` when sanitizing structured output schemas, so the reference still resolves.
