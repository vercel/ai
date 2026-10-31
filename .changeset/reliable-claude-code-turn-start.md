---
'@ai-sdk/harness': patch
'@ai-sdk/harness-claude-code': patch
---

Recover Claude Code turn starts lost on a dropped WebSocket connection using idempotent start identifiers. Bound the wait for the first turn event with `turnStartTimeoutMs` (120 seconds by default), and fail safely when reconnecting to an older bridge that has not accepted the start.

Preserve first delivery of turns submitted during an idle reconnect, including on older bridges, without sending duplicate starts or treating an unsent start as lost.
