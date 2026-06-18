"""Reusable harness-v1 bridge transport for the DeepAgents Python bridge.

Phase 3 placeholder. This module will own the transport concerns that
`@ai-sdk/harness/bridge` (`runBridge`) provides for Node bridges, re-implemented
in Python so the DeepAgents runtime can speak the harness-v1 wire protocol
directly (Option A):

  - WebSocket server + bridge-token auth
  - the `bridge-ready` stdout announcement and `bridge-hello` handshake
  - the in-memory event log with monotonic `seq`, plus resume replay
  - the lifecycle / meta state files on disk

`bridge.py` supplies only the DeepAgents-specific turn driver on top of this.
"""
