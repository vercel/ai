---
"@ai-sdk/anthropic": patch
---

fix(anthropic): use native structured outputs for Claude models that reject forced tool use (Sonnet 5.5, Opus 5.5, Fable 5.1) even when the provider disables them by default, as Amazon Bedrock and Google Vertex do. Self-referencing schemas keep the JSON response tool, and when the model answers in text without calling that tool the text is now returned instead of dropped.
