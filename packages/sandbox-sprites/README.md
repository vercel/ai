# AI SDK - Sprites Sandbox

_This package is **experimental**._

`HarnessV1SandboxProvider` implementation for [Sprites](https://sprites.dev) — Fly.io's
stateful sandboxes. It is bridge-capable: `getPortUrl` returns a plain `wss://` URL that
the Claude Code and Codex harness adapters dial directly, so Sprites can back bridge
harnesses (not just non-bridge flows).

## Setup

```bash
npm i @ai-sdk/sandbox-sprites
```

Authenticate with a Sprites API token (`org/projectNumber/tokenId/secret`). Pass it as
`apiKey`, or set the `SPRITES_API_KEY` environment variable.

## Usage

The factory is synchronous. The returned provider is stable; a Sprite is created on demand
inside `provider.createSession()`.

```ts
import { createSpritesSandbox } from '@ai-sdk/sandbox-sprites';

const spritesSandbox = createSpritesSandbox({
  apiKey: process.env.SPRITES_API_KEY,
});

const networkSandboxSession = await spritesSandbox.createSession();
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat hello.txt',
});
console.log(stdout); // "hi"

await networkSandboxSession.destroy();
```

`networkSandboxSession.restricted()` is typed as `Experimental_SandboxSession`, so it's
safe to pass to AI SDK tools that accept `experimental_sandbox`. The network sandbox
session itself carries the infra surface (`ports`, `getPortUrl`, `setNetworkPolicy`,
`stop`, `destroy`) that only the harness should reach for.

### Using it with a bridge harness

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createSpritesSandbox } from '@ai-sdk/sandbox-sprites';

export const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createSpritesSandbox({ apiKey: process.env.SPRITES_API_KEY }),
  instructions: 'You are a careful coding assistant.',
});
```

A Sprite proxies its always-on public URL (`https://<name>-<suffix>.sprites.app`) to a
single internal HTTP port (`8080`). `getPortUrl({ port: 8080, protocol: 'ws' })` returns
`wss://<name>-<suffix>.sprites.app/`, which a stock WebSocket client dials with the
appended `?agent_bridge_token=…` — no custom client, headers, or init frame.

For that bridge URL to be reachable by a stock client (no auth header), the Sprite's URL
auth must be `public`. The provider sets this automatically for Sprites it creates
(override with `urlAuth: 'sprite'`). Public URLs are reachable by anyone with the URL, so
the in-Sprite bridge is the authentication boundary (via `agent_bridge_token`).

#### Toolchain requirement (claude-code / codex)

The Claude Code and Codex adapters bootstrap their runtime inside the sandbox with
`pnpm install`. The stock Sprite image ships `node`, `npm`, and `corepack` but **no `pnpm`
on `PATH`**, and the bootstrap currently requires **pnpm 10** (pnpm 11 fails it with
`ERR_PNPM_IGNORED_BUILDS`). The adapter runs the bootstrap immediately after the sandbox
is created, so a `pnpm` shim must already exist on the Sprite. The reliable pattern today
is to pre-provision the Sprite and wrap it:

```ts
// 1. create + prepare the Sprite once (e.g. via the Sprites CLI/API):
//    sprite exec -s my-sprite -- corepack prepare pnpm@10.33.4 --activate
//    sprite exec -s my-sprite -- corepack enable --install-directory /usr/local/bin pnpm
// 2. wrap it (the provider will not create/destroy it):
const sandbox = createSpritesSandbox({
  apiKey: process.env.SPRITES_API_KEY,
  spriteName: 'my-sprite',
  urlAuth: 'public',
});
```

Bake `pnpm` into a Sprite checkpoint/base image to avoid the per-session prep. Non-bridge
flows (file I/O, `run`, `spawn`) need no toolchain beyond what your commands use.

### Wrapping an existing Sprite

Pass `spriteName` to wrap a Sprite you created elsewhere. The provider does not create or
delete it (`destroy()` is a no-op); the caller owns the lifecycle.

```ts
const spritesSandbox = createSpritesSandbox({
  apiKey: process.env.SPRITES_API_KEY,
  spriteName: 'my-sprite',
  urlAuth: 'public', // ensure the bridge URL is reachable
});
```

### Mid-session network policy

Sprites enforce outbound egress by domain pattern. The provider translates the
harness-level `HarnessV1NetworkPolicy` to Sprites' domain rules:

```ts
await networkSandboxSession.setNetworkPolicy?.({
  mode: 'custom',
  allowedHosts: ['github.com', '*.npmjs.org'],
});
```

`'allow-all'` clears the rule set, `'deny-all'` blocks everything, and `'custom'` allows
the listed domains with a catch-all deny. CIDR-based policies are not supported (Sprites
match on domains), so `allowedCIDRs` / `deniedCIDRs` are rejected.

## Settings

| Setting            | Description                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`           | Sprites API token. Defaults to `SPRITES_API_KEY` / `SPRITES_TOKEN`.                                                                                              |
| `baseUrl`          | Control-plane base URL. Defaults to `SPRITES_API_URL` or `https://api.sprites.dev`.                                                                              |
| `workingDirectory` | Base dir for resolving relative file paths **and** the default `cwd` for `run`/`spawn` when no per-call `workingDirectory` is given. Defaults to `/home/sprite`. |
| `spriteName`       | Wrap an existing Sprite by name instead of creating one.                                                                                                         |
| `name`             | Explicit name for a created Sprite (else auto-derived from the session id).                                                                                      |
| `urlAuth`          | `'public'` (default for created Sprites) or `'sprite'`.                                                                                                          |
| `waitForCapacity`  | Block on fleet capacity instead of failing fast when creating a Sprite.                                                                                          |

## Known limitations & security

- **`run()` may merge stderr into stdout for instant commands.** Sprites' exec
  agent uses a "fast path" that replays a command's buffered output as a single
  stdout stream when the command exits before the client attaches. For such
  near-instant commands, `run().stderr` can be empty with its content folded
  into `stdout` (order and exit code are preserved). Commands that run long
  enough to stream get correctly separated stdout/stderr. Don't branch solely on
  `stderr` being empty to detect success — check `exitCode`.
- **Environment variables travel in the exec request URL.** The Sprites exec
  protocol passes `env` as query parameters, which proxies, load balancers, and
  APM tools routinely log. Avoid putting secrets in `env`; prefer writing them to
  a file in the sandbox. (The provider strips the query string from any
  connection-error message so secrets don't leak there.)
- **Created Sprites default to a public URL.** `urlAuth: 'public'` is required so
  bridge harnesses can reach the in-Sprite bridge with a stock WebSocket, but it
  means the Sprite's URL — and any service on port 8080 — is reachable by anyone
  with the URL (the bridge token is the auth boundary). Set `urlAuth: 'sprite'`
  if you don't need the bridge and want org-token-gated access.
- **Node-only runtime.** Authenticating the exec WebSocket relies on undici's
  `headers` constructor option (Node.js ≥ 22). Spec-compliant `WebSocket`
  environments (browsers, edge/workerd, Deno) ignore it; this package targets
  Node.
