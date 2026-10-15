---
'@ai-sdk/anthropic': patch
---

fix(anthropic): fall back to auto tool choice when thinking is enabled with forced tool use

When thinking is enabled (extended, adaptive, or between_tools thinking, or via top-level reasoning), the Anthropic API rejects forced tool choices (`tool` or `required`) with a 400 error ("Thinking may not be enabled when tool_choice forces tool use"). The provider now handles forced tool choices when thinking is enabled the same way as for models that reject forced tool use: `required` falls back to `auto`, and `tool` sends only that tool with `auto`, each emitting an unsupported `toolChoice` warning.
