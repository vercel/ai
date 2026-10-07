---
'@ai-sdk/harness-pi': patch
---

fix(harness-pi): report real step and turn usage

`finish-step` usage was always zero, and `finish.totalUsage` was the running total of the whole Pi session, not the usage of the current turn. Each step now reports the usage of its assistant message. The turn reports the change in Pi's session stats across the prompt. `inputTokens.total` now includes cached input. `noCache` is set, and `outputTokens.text` and `reasoning` are set when the provider reports reasoning tokens.
