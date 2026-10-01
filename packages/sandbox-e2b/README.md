# AI SDK - E2B Sandbox

_This package is **experimental**._

Sandbox session implementation for [E2B](https://e2b.dev/docs).

## Setup

```bash
npm i @ai-sdk/sandbox-e2b
```

## Usage

```ts
import { createE2BNetworkSandboxSession } from '@ai-sdk/sandbox-e2b';

const networkSandboxSession = await createE2BNetworkSandboxSession({
  ports: [3000],
});
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.destroy();
```

`createE2BNetworkSandboxSession()` accepts the options of the E2B SDK's `Sandbox.create()`, such as `timeoutMs`, `envs`, `metadata`, `network`, and `lifecycle`, plus:

- `baseTemplate`: the name or ID of the E2B template that the sandbox starts from. Defaults to E2B's `base` template. The E2B SDK calls this option `template`; here `template` is the harness sandbox template.
- `ports`: the ports that the session lists in `ports`. See [Ports](#ports).

The sandbox is killed 30 minutes after it is created or resumed unless `timeoutMs` says otherwise. The CPU and memory of a sandbox come from its E2B template.

### Use cases

- Create a network sandbox session with `createE2BNetworkSandboxSession()` and pass it to `HarnessAgent.createSession({ sandboxSession })`. For reusable templates, pass `template: await agent.getSandboxTemplate()` to the creator function. The prepared sandbox is saved as an E2B snapshot named after the template, and later sandboxes start from it.
- E2B assigns the ID of a sandbox, so creation does not accept a `sandboxId`. Persist the returned session's `id` and use `resumeE2BNetworkSandboxSession({ sandboxId })` to reattach. See [Stopping and resuming](#stopping-and-resuming).
- Take a network sandbox session's process-restricted subset with `networkSandboxSession.restricted()` and use it with AI SDK tools that accept `experimental_sandbox`.
- Adapt an existing native `Sandbox` with `createE2BSandboxSessionFromNativeSandbox({ sandbox, defaultWorkingDirectory })` and use it with AI SDK tools that accept `experimental_sandbox`. E2B reports a sandbox's working directory only through an asynchronous call, so the adaptation takes the directory that commands run in by default, for example `/home/user`. `createE2BNetworkSandboxSessionFromNativeSandbox({ sandbox, defaultWorkingDirectory, ports })` adapts it as a network sandbox session.

## Templates for bridge-backed harness adapters

Bridge-backed harness adapters such as Claude Code and Codex install their bridge in the sandbox with `pnpm`. E2B's `base` template has no `pnpm`, so build a template that has it once and pass its name as `baseTemplate`:

```ts
import { Template } from 'e2b';

await Template.build(
  Template().fromNodeImage('24').npmInstall('pnpm', { g: true }),
  'ai-sdk-node24',
  { cpuCount: 2, memoryMB: 2048 },
);
```

```ts
const sandboxSession = await createE2BNetworkSandboxSession({
  baseTemplate: 'ai-sdk-node24',
  ports: [4000],
  template: await agent.getSandboxTemplate(),
});
```

## Stopping and resuming

- `stop()` pauses the sandbox. E2B keeps its filesystem and memory, including running processes, until the sandbox is resumed or destroyed.
- `resumeE2BNetworkSandboxSession({ sandboxId })` reattaches to a running sandbox and resumes a paused one. It never creates a sandbox, and it fails when the sandbox no longer exists. A harness session can then be resumed with `createSession({ sandboxSession, sessionId, resumeFrom })`.
- `destroy()` kills the sandbox, whether it is running or paused.

A sandbox that reaches its `timeoutMs` is killed and cannot be resumed, unless it was created with `lifecycle: { onTimeout: 'pause' }`. E2B keeps a paused sandbox until it is destroyed.

`HarnessAgentSession.detach()` and `HarnessAgentSession.stop()` leave a sandbox session that you passed to `createSession()` running; only the sandbox session's own `stop()` and `destroy()` end the sandbox.

## Ports

E2B routes every port that a process in the sandbox listens on, without registering it. `getPortEndpoint()` resolves a port to the host that E2B's `getHost(port)` returns, `<port>-<sandboxId>.e2b.app`: `https://` by default and `wss://` for `protocol: 'ws'`. The URL can be dialed directly and stays the same for as long as the sandbox exists, including after it is stopped and resumed.

The session's `ports` are the ones passed as `ports` at creation. Bridge-backed harness adapters such as Claude Code and Codex bind the first listed port unless they are configured with a `port`. The list is stored in the sandbox metadata under `ai-sdk-sandbox-ports`, so `resumeE2BNetworkSandboxSession()` restores it.

There is no `setPorts()`, because E2B has no port registration to replace.

A sandbox created with `network: { allowPublicTraffic: false }` only accepts requests that carry its traffic access token. `getPortEndpoint()` then returns the token in `headers`, which the harness adapters send when they connect. The deprecated `getPortUrl()` returns the URL without it.

## Authentication

E2B accepts `E2B_API_KEY`, or an explicit `apiKey` setting.

## Network policy

`setNetworkPolicy()` replaces the outbound network policy of the running sandbox:

- `{ mode: 'allow-all' }` and `{ mode: 'deny-all' }` open and close all outbound access.
- `{ mode: 'custom', allowedHosts, allowedCIDRs }` admits only the listed hosts and IP ranges. Hosts may use a `*.` prefix. E2B matches a host only for HTTP on port 80 and TLS on port 443, and limits how many hosts a sandbox can list.
- `deniedCIDRs` is not supported, because E2B gives its allow list precedence over its deny list. A policy that sets it fails with a `HarnessCapabilityUnsupportedError`.

E2B replaces the whole egress configuration on every change. On a sandbox with an egress proxy or per-host transform rules in its native `network` options, `setNetworkPolicy()` fails with a `HarnessCapabilityUnsupportedError` instead of dropping them.

## Credential brokering

The session does not implement request transformations, because E2B's transform rules match the destination host only. Bridge-backed harness adapters therefore forward model credentials into the sandbox process instead of brokering them. Each harness adapter's `credentialForwarding` setting controls what the sandbox receives.
