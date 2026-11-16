---
'@ai-sdk/harness': patch
---

fix(harness): refuse approval-requiring tools in HarnessV2 agents

The HarnessV2 agent ran host tools that set `needsApproval` without asking for
consent, because the engine neither evaluated the requirement nor rejected it.
It now fails closed: it throws a `HarnessCapabilityUnsupportedError` when built
with such a tool, with the `toolApproval` setting, or with a `permissionMode`
other than `'allow-all'`, and it refuses a tool whose requirement is added after
construction instead of running it.
