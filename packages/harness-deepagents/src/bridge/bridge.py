"""DeepAgents harness bridge entrypoint (runs inside the sandbox).

Phase 3 placeholder. This process is launched by the host adapter
(`createDeepAgents().doStart`) as `python3 /tmp/harness/deepagents/bridge.py`.

Responsibilities (to be implemented in Phase 3 — Option A, the Python bridge
speaks the harness-v1 wire protocol directly):

  - Bind a WebSocket server and print the harness-v1 `bridge-ready` JSON line
    (`{"type": "bridge-ready", "port": <port>}`) to stdout.
  - Authenticate the host connection via the bridge token, then send
    `bridge-hello`.
  - Drive DeepAgents (`create_deep_agent()`) per inbound `start` command and
    translate LangGraph `astream_events(v=2)` into harness-v1 stream parts
    (stream-start / text-* / reasoning-* / tool-call / tool-approval-request /
    tool-result / finish-step / finish / error).
  - Consume the shared inbound command vocabulary (tool-result,
    tool-approval-response, user-message, abort, shutdown, resume, detach).
  - Maintain the seq event-log + resume replay and lifecycle files.

The reusable transport lives in `bridge_runtime.py`.
"""

raise NotImplementedError(
    "DeepAgents Python bridge is not implemented yet (Phase 3)."
)
