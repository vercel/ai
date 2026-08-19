---
'@ai-sdk/harness': patch
---

feat (harness): read the runtime's own conversation history back through the contract. `HarnessAgentSession.readHistory({ since })` returns the messages the underlying runtime persisted — including exchanges that happened outside this process, such as the same conversation continued interactively in the agent's own CLI — normalized to the stream-part vocabulary (text, reasoning, tool-call, tool-result with full output) with the runtime's raw record attached for full fidelity. Pass a previous result's `cursor` as `since` to read only the delta. Backed by the new optional `doReadHistory` capability on `HarnessV1Session`; `session.supportsHistory` feature-detects it, `HarnessCapabilityUnsupportedError` is thrown when the adapter lacks it, and the new `HarnessHistoryUnavailableError` when the adapter cannot reach the runtime's store from the current environment.
