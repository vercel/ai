---
'@ai-sdk/anthropic': patch
---

fix(anthropic): implement temperature/topP mutual exclusivity

Resolves the Anthropic API breaking change where sampling parameters must use only `temperature` OR `top_p`, not both. When both parameters are provided:

- Temperature takes priority and topP is ignored
- A warning is added to inform users: "topP is not supported when temperature is set. topP is ignored."
- The validation only runs when thinking mode is not enabled (thinking mode has its own parameter validation)

See Anthropic migration guide: https://platform.claude.com/docs/en/about-claude/models/migrating-to-claude-4
