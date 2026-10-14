---
"@ai-sdk/anthropic": patch
---

fix(anthropic): fall back to `auto` tool choice with a warning when a forced tool choice (`required` or `tool`) is combined with extended thinking, instead of sending a request the API rejects with "Thinking may not be enabled when tool_choice forces tool use". A `tool` choice keeps only the selected tool, as for models that reject forced tool use.
