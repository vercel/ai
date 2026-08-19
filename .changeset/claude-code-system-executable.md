---
'@ai-sdk/harness-claude-code': patch
---

feat (harness-claude-code): always drive the environment's own `claude` executable. The bootstrap now installs only the bridge's JavaScript dependencies (about 40 MB, down from 785 MB) — the bundled CLI copies that `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/claude-code` ship as platform binaries are never downloaded. The adapter resolves the environment's `claude` at session start, verifying it runs rather than merely finding it on `PATH`, and points the Agent SDK at it. When the environment has none, installation of the pinned version is requested through the agent's `onInstallRequest` consent policy: provider-owned (disposable) sandboxes install by default, user-owned environments fail with `HarnessExecutableMissingError` carrying the exact install command unless consent is given. Conversations remain the user's own — the same threads can be continued directly with `claude --resume` outside the SDK.
