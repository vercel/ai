---
'@ai-sdk/sandbox-tensorlake': patch
---

Add `@ai-sdk/sandbox-tensorlake`, a `HarnessV1SandboxProvider` backed by Tensorlake sandboxes. Supports running commands, spawning processes, file I/O, suspend-based stop with resume, and snapshot-backed session forking. The harness bridge is reached over an authenticated Tensorlake TCP tunnel (so `getPortUrl` works without exposing public ingress), and a dedicated bridge port is advertised automatically so harnesses like Claude Code work out of the box.

The provider sanitizes harness session ids (mixed-case) into valid Tensorlake sandbox names (lowercase letters, digits, and hyphens), deterministically so `resumeSession` still locates the sandbox by name. A `setup` option (e.g. `createTensorlakeSandbox({ setup: ['npm install -g pnpm@10'] })`) runs shell commands as root once after the sandbox is created and before any harness bootstrap, provisioning tools the default image lacks without building a custom image; with a snapshot recipe the setup runs on the template before the checkpoint, so it is baked into every forked session.
