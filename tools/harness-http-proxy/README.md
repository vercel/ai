# harness-http-proxy (internal, unshipped)

Test-only substrate for **intercepting the HTTP/HTTPS traffic of a harness agent's
underlying CLI** so the e2e suite can record real LLM traffic once and replay it
deterministically offline.

It is **`private`** and never published. It depends on `@vercel/sandbox` and only
works against bridge-backed adapters running in a real Vercel sandbox (Claude
Code, Codex). Pi runs its model host-side and does not need this.

## What's here

- `go/` — the Go MITM proxy, **vendored verbatim** from
  `agent-harness-sdk/packages/http-proxy-server`. Source of the binaries in
  `bin/`. Not built during install; the committed binaries are the source of
  truth. Rebuild (rarely) with `pnpm build:binaries` (requires the Go toolchain).
- `bin/` — prebuilt `linux-x86_64` / `linux-arm64` binaries, committed.
- `src/` — host-side TypeScript: the proxy wire protocol, the `ProxyChannel`
  (host↔in-sandbox-proxy WebSocket), the privileged install/spawn, the
  `httpHandler` seam, thin record/replay handlers, and `createProxiedSandbox`.

## How it attaches (no harness/adapter changes)

`createProxiedSandbox(...)` composes existing surfaces:

1. `Sandbox.create({ ports, env, networkPolicy })` — proxy env (`HTTP_PROXY`,
   `NODE_EXTRA_CA_CERTS`, …) is set at create and inherited by every command,
   so the agent CLI picks it up transparently.
2. Privileged install + spawn of the Go proxy on the raw sandbox.
3. `createVercelSandbox({ sandbox, bridgePorts })` — wrap the prepared sandbox
   and run a normal `HarnessAgent`.

The CLI's HTTPS goes to the in-sandbox proxy (localhost, exempt from
`networkPolicy`), which tunnels to the host `httpHandler`. With
`networkPolicy: 'deny-all'`, replay is provably offline.
