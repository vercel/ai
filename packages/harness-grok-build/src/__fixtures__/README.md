# Grok Build CLI fixtures

## `streaming-json-basic.jsonl` (REAL capture — source of truth)

Real output of:

    grok -p "Create a file hello.txt containing the text hi, then read it back." \
      -m grok-build-0.1 --output-format streaming-json --always-approve

captured against `@xai-official/grok` v0.2.53 (direct xAI API, `XAI_API_KEY`) on
2026-06-18. Home-directory path in the assistant text was redacted to
`/Users/USER`.

### Actual schema (flat, newline-delimited JSON)
This mode is lean. Only three event types appear:

- `{"type":"thought","data":"<chunk>"}` — reasoning/thinking text delta
- `{"type":"text","data":"<chunk>"}` — assistant message text delta
- `{"type":"end","stopReason":"EndTurn","sessionId":"<uuid>","requestId":"<uuid>"}` — terminal

### What this mode does NOT include (important)
- **No tool-call / tool-result events** — even though the agent created and read
  the file, `streaming-json` does not surface tool invocations.
- **No file-change events.**
- **No token usage.**

Full tool/file/usage fidelity requires the `grok agent` ACP (JSON-RPC stdio)
surface instead — that's a planned follow-up (see the harness-grok-build plan).
The v1 adapter maps only thought→reasoning, text→text, end→finish.

### stopReason values
Observed: `EndTurn`. Others (e.g. max-tokens, cancellation) are unconfirmed —
map defensively.
