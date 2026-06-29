# Grok Build CLI fixtures

The adapter now drives `grok agent stdio` over the Agent Client Protocol
(ACP/JSON-RPC), not `grok -p --output-format streaming-json`. The ACP surface
carries text and reasoning, tool-call / tool-result / file-change session
updates, token usage, and a structured stop reason.

Stream mapping is exercised in the harness unit tests using synthetic ACP
session updates rather than a recorded capture, so no live fixture file is the
source of truth anymore.

## `streaming-json-basic.jsonl` (legacy capture — historical only)

A real capture of the old `streaming-json` mode:

    grok -p "Create a file hello.txt containing the text hi, then read it back." \
      -m grok-build-0.1 --output-format streaming-json --always-approve

against `@xai-official/grok` v0.2.53 on 2026-06-18. Retained only as a record of
the pre-ACP surface; it is not used by the current adapter or tests.
