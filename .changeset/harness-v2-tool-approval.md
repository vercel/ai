---
'@ai-sdk/harness': patch
---

fix(harness): refuse approval-requiring tools in HarnessV2 agents

The HarnessV2 agent ran host tools that set `needsApproval` without asking for
consent, because the engine neither evaluated the requirement nor rejected it.
An adapter's built-in tools could carry the same property and ran the same way.
The agent now fails closed: it throws a `HarnessCapabilityUnsupportedError` at
construction for an app tool or a built-in tool that sets `needsApproval`, for
the `toolApproval` setting, and for a `permissionMode` other than `'allow-all'`;
`executeHostTool()`, `executeBuiltinTool()` and `gateBuiltinTool()` refuse a
requirement added after construction instead of running the tool.
`toolApproval` and the other permission modes were already rejected as
unsupported settings; they now fail with that capability error, and
`permissionMode: 'allow-all'` is accepted.
