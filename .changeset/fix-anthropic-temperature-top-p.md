---
'@ai-sdk/anthropic': patch
---

fix(anthropic): allow both temperature and topP for non-Anthropic models using the Anthropic-compatible API

The temperature/topP mutual exclusivity check now only applies to known Anthropic models (model IDs starting with `claude-`). Non-Anthropic models using the Anthropic-compatible API (e.g. Minimax) can now send both parameters as required by their APIs.
