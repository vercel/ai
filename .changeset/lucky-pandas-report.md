---
'@ai-sdk/harness-claude-code': patch
---

fix (harness-claude-code): treat a `result` message flagged `is_error` as a terminal error

The Claude Code CLI reports a rejected request with `subtype: 'success'` and `is_error: true`, carrying the message in `result` and the status in `api_error_status`. The bridge branched only on `subtype`, so the error text was discarded and the turn settled as a normal empty turn — every API failure surfaced to callers as an agent that returned no output.
