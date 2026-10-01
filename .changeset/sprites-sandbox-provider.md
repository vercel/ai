---
'@ai-sdk/sandbox-sprites': patch
---

feat(sandbox-sprites): add Sprites (sprites.dev) sandbox provider

New `@ai-sdk/sandbox-sprites` package with network sandbox sessions backed by Fly.io
Sprites. `createSpritesNetworkSandboxSession()` and `resumeSpritesNetworkSandboxSession()`
return a `HarnessV1NetworkSandboxSession` for `HarnessAgent.createSession({ sandboxSession })`.
Bridge-capable on a Sprite with a public URL: `getPortEndpoint` returns a plain `wss://` URL
to the Sprite's single proxied HTTP port (8080), so it can back the Claude Code and Codex
bridge adapters, and created Sprites get the `pnpm` their bootstrap needs. Supports exec,
filesystem I/O, domain-based network policy, sandbox templates, and reattaching to an
existing Sprite by name.
