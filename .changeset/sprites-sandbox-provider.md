---
'@ai-sdk/sandbox-sprites': patch
---

feat(sandbox-sprites): add Sprites (sprites.dev) sandbox provider

New `@ai-sdk/sandbox-sprites` package implementing `HarnessV1SandboxProvider` backed by
Fly.io Sprites. Bridge-capable: `getPortUrl` returns a plain `wss://` URL to the Sprite's
single proxied HTTP port (8080), so it can back the Claude Code and Codex bridge adapters.
Supports exec, filesystem I/O, domain-based network policy, create-new and wrap-existing
modes, and cross-process resume.
