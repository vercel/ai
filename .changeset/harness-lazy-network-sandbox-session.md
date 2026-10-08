---
'@ai-sdk/harness': patch
---

feat(harness): createLazyNetworkSandboxSession acquires the sandbox on its first use

`createLazyNetworkSandboxSession({ acquire, defaultWorkingDirectory })` returns a network sandbox session that calls `acquire` once, on the first file, exec, spawn or port operation, and delegates to the session it returns. Combined with `sandboxConfig.setup: 'lazy'`, a `HarnessAgent` session whose turns never touch the sandbox neither creates nor resumes one.

`defaultWorkingDirectory`, `ports` and `description` are fixed at creation. A rejected acquisition stays rejected. `id` throws until the sandbox is acquired, and `stop()` and `destroy()` resolve without acquiring when the sandbox was never used. The network-policy, request-transformation and `setPorts` mutators are not provided.
