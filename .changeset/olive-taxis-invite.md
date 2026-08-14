---
'@ai-sdk/harness-opencode': patch
---

fix (harness-opencode): do not emit a pre-turn assistant message as the turn's reply

When the OpenCode event stream ended without settling the current turn, the
context fallback emitted the session's newest assistant message with a
successful finish reason. On a resumed session that message can be the
previous turn's answer, so the caller received a stale reply — text only,
without the tool calls that produced it — reported as success. The fallback
now compares against the newest assistant id observed before the prompt was
sent and declines to emit when nothing new was recorded, leaving the existing
`missingContext` path to report the turn honestly.
