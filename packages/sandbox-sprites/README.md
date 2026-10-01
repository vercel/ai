# AI SDK - Sprites Sandbox

_This package is **experimental**._

Sandbox session implementation for [Sprites](https://sprites.dev), Fly.io's stateful
sandboxes. A session on a Sprite with a public URL is bridge-capable: `getPortEndpoint`
returns a plain `wss://` URL that the Claude Code and Codex harness adapters dial
directly. See [Bridge capability](#bridge-capability) for which sessions that covers.

## Setup

```bash
npm i @ai-sdk/sandbox-sprites
```

Authenticate with a Sprites API token (`org/projectNumber/tokenId/secret`). Pass it as
`apiKey`, or set the `SPRITES_API_KEY` environment variable.

## Usage

```ts
import { createSpritesNetworkSandboxSession } from '@ai-sdk/sandbox-sprites';

const networkSandboxSession = await createSpritesNetworkSandboxSession();
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
session itself carries the infra surface (`ports`, `getPortEndpoint`, `setNetworkPolicy`,
`stop`, `destroy`) that only the harness should reach for.

### Use cases

- Create a network sandbox session with `createSpritesNetworkSandboxSession()` and pass it to `HarnessAgent.createSession({ sandboxSession })`. Pass `template: await agent.getSandboxTemplate()` to the creator function to install the harness bridge while the Sprite is created. Sprites cannot start a new Sprite from a snapshot of another, so the template is prepared in every new Sprite.
- Set `sandboxId` to name a new Sprite, or persist the returned session's `id`. Creation never resumes an existing Sprite and a conflicting name fails; use `resumeSpritesNetworkSandboxSession({ sandboxId })` to reattach. That is also how you use a Sprite that you created elsewhere.
- Take a network sandbox session's process-restricted subset with `networkSandboxSession.restricted()` and use it with AI SDK tools that accept `experimental_sandbox`.

### Using it with a bridge harness

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createSpritesNetworkSandboxSession } from '@ai-sdk/sandbox-sprites';

const agent = new HarnessAgent({
  harness: claudeCode,
  instructions: 'You are a careful coding assistant.',
});

const sandboxSession = await createSpritesNetworkSandboxSession({
  template: await agent.getSandboxTemplate(),
});
const session = await agent.createSession({ sandboxSession });
```

The Codex adapter is used the same way; nothing in the sandbox code is specific to a
harness.

A Sprite proxies its always-on public URL (`https://<name>-<suffix>.sprites.app`) to a
single internal HTTP port (`8080`). `getPortEndpoint({ port: 8080, protocol: 'ws' })` returns
`wss://<name>-<suffix>.sprites.app/` with no headers, which a stock WebSocket client dials
with the appended `?agent_bridge_token=…`. No custom client, headers, or init frame are
needed. The URL is derived from the Sprite's name, so it stays the same across reconnects
and after reattaching with `resumeSpritesNetworkSandboxSession()`.

### Bridge capability

A session is bridge-capable when its Sprite is on `public` URL auth and has `pnpm` on
`PATH`:

| Session                                                     | Bridge-capable                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `createSpritesNetworkSandboxSession()`                      | Yes. The Sprite is created on `public` URL auth and `pnpm` is installed. |
| `createSpritesNetworkSandboxSession({ urlAuth: 'sprite' })` | No. File and process access only.                                        |
| `resumeSpritesNetworkSandboxSession({ sandboxId })`         | Only when the Sprite is on `public` URL auth and has `pnpm`.             |

For the bridge URL to be reachable by a stock client (no auth header), the Sprite's URL
auth must be `public`. Public URLs are reachable by anyone with the URL, so the in-Sprite
bridge is the authentication boundary (via `agent_bridge_token`). On any other URL auth
that client is redirected at the auth gate, so the session exposes no port: `ports` is
empty, `getPortEndpoint()` throws a `HarnessCapabilityUnsupportedError`, and bridge-backed
harness adapters do not select it. Pass `urlAuth: 'public'` to the resume function to put
an existing Sprite on `public` URL auth.

#### Toolchain requirement (claude-code / codex)

The Claude Code and Codex adapters bootstrap their runtime inside the sandbox with
`pnpm install`. The stock Sprite image ships `node`, `npm`, and `corepack` but **no `pnpm`
on `PATH`**, so `createSpritesNetworkSandboxSession()` enables `pnpm` 11 through `corepack`
in every Sprite it creates, before the template is prepared. A Sprite that already has
`pnpm` is left as it is.

A Sprite that you created elsewhere is reattached as it is. Give it `pnpm` once before
using it with a bridge harness:

```bash
sprite exec -s my-sprite -- corepack enable --install-directory /usr/local/bin pnpm
sprite exec -s my-sprite -- corepack prepare pnpm@11 --activate
```

Non-bridge flows (file I/O, `run`, `spawn`) need no toolchain beyond what your commands use.

### Stopping and resuming

- Sprites have no stop call. A Sprite pauses on its own when it is idle and wakes on the next request, so `stop()` returns without doing anything. The filesystem persists across a pause; running processes do not survive a long one.
- `resumeSpritesNetworkSandboxSession({ sandboxId })` reattaches to the Sprite named `sandboxId` and never creates one. A harness session that keeps its state in the sandbox, such as Claude Code or Codex, can then be resumed with `createSession({ sandboxSession, sessionId, resumeFrom })`.
- `destroy()` deletes the Sprite, also on a session that was reattached.

`HarnessAgentSession.detach()` and `HarnessAgentSession.stop()` leave a sandbox session
that you passed to `createSession()` untouched; only the sandbox session's own `destroy()`
ends the Sprite.

### Mid-session network policy

Sprites enforce outbound egress by domain pattern. The session translates the
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

### Credential brokering

The session does not implement request transformations, so bridge-backed harness adapters
forward model credentials into the Sprite instead of brokering them. Each harness adapter's
`credentialForwarding` setting controls what the Sprite receives.

## Options

| Option             | Description                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`           | Sprites API token. Defaults to `SPRITES_API_KEY` / `SPRITES_TOKEN`.                                                                                                                            |
| `baseUrl`          | Control-plane base URL. Defaults to `SPRITES_API_URL` or `https://api.sprites.dev`.                                                                                                            |
| `workingDirectory` | Base dir for resolving relative file paths **and** the default `cwd` for `run`/`spawn` when no per-call `workingDirectory` is given. Defaults to the directory the Sprite starts a process in. |
| `sandboxId`        | Name of the Sprite. Optional on creation (a name is generated when omitted), required on resume.                                                                                               |
| `template`         | Creation only. Harness sandbox template to prepare in the new Sprite.                                                                                                                          |
| `urlAuth`          | `'public'` or `'sprite'`. Creation defaults to `'public'`; resume leaves the Sprite as it is unless set.                                                                                       |
| `waitForCapacity`  | Creation only. Block on fleet capacity instead of failing fast when creating a Sprite.                                                                                                         |
| `abortSignal`      | Aborts creation or resume.                                                                                                                                                                     |

### Deprecated provider

`createSpritesSandbox()` returns a `HarnessV1SandboxProvider` for the deprecated
`HarnessAgent({ sandbox })` setting. It accepts `apiKey`, `baseUrl`, `workingDirectory`
(default `/home/sprite`), `urlAuth` and `waitForCapacity`, plus `name` to name the created
Sprite or `spriteName` to wrap an existing one, which it then never deletes. Use the create
and resume functions for new code.

## Known limitations & security

- **`run()` may merge stderr into stdout for instant commands.** Sprites' exec
  agent uses a "fast path" that replays a command's buffered output as a single
  stdout stream when the command exits before the client attaches. For such
  near-instant commands, `run().stderr` can be empty with its content folded
  into `stdout` (order and exit code are preserved). Commands that run long
  enough to stream get correctly separated stdout/stderr. Don't branch solely on
  `stderr` being empty to detect success; check `exitCode`.
- **The command line travels in the exec request URL; environment variables do
  not.** The Sprites exec protocol takes the command and working directory as
  query parameters, which proxies, load balancers, and APM tools routinely log,
  so don't put secrets in a command. Values passed as `env` are written to a
  temporary file in the Sprite instead, which the command sources and deletes
  before it starts. (The session also strips the query string from any
  connection-error message.)
- **Unread `spawn()` output is buffered in memory.** The exec WebSocket cannot
  be paused, so output of a spawned process that is never read accumulates on
  the host until the process ends. Read `stdout` and `stderr` of long-running
  processes.
- **Created Sprites default to a public URL.** `urlAuth: 'public'` is required so
  bridge harnesses can reach the in-Sprite bridge with a stock WebSocket, but it
  means the Sprite's URL, and any service on port 8080, is reachable by anyone
  with the URL (the bridge token is the auth boundary). Set `urlAuth: 'sprite'`
  if you don't need the bridge and want org-token-gated access.
- **Node-only runtime.** Authenticating the exec WebSocket relies on undici's
  `headers` constructor option (Node.js ≥ 22). Spec-compliant `WebSocket`
  environments (browsers, edge/workerd, Deno) ignore it; this package targets
  Node.
