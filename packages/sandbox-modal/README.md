# AI SDK - Modal Sandbox

_This package is **experimental**._

Sandbox session implementation for [Modal Sandboxes](https://modal.com/docs/guide/sandboxes).

## Setup

```bash
npm i @ai-sdk/sandbox-modal
```

## Usage

```ts
import { createModalNetworkSandboxSession } from '@ai-sdk/sandbox-modal';

const networkSandboxSession = await createModalNetworkSandboxSession({
  encryptedPorts: [4000],
});
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.destroy();
```

`createModalNetworkSandboxSession()` accepts the options of the Modal SDK's `client.sandboxes.create()`, such as `timeoutMs`, `cpu`, `memoryMiB`, `env`, `secrets`, and `volumes`, plus:

- `client`: the `ModalClient` to use. Defaults to a new client.
- `appName`: the Modal App that owns the sandbox. It is created when it does not exist. Defaults to `ai-sdk-sandbox`.
- `image`: a registry tag such as `python:3.13`, or a Modal `Image`. Defaults to `node:24` with `pnpm` installed and `/workspace` as the working directory. Commands run through `bash`, so the image must provide it.

Sandboxes are terminated after 30 minutes unless `timeoutMs` says otherwise. Outbound network access is open unless `blockNetwork` or an allowlist is passed.

### Use cases

- Create a network sandbox session with `createModalNetworkSandboxSession()` and pass it to `HarnessAgent.createSession({ sandboxSession })`. For reusable templates, pass `template: await agent.getSandboxTemplate()` to the creator function. The prepared filesystem is published as a Modal image named after the template, and later sandboxes start from it.
- Set `sandboxId` to name a new sandbox, or persist the returned session's `id`. Creation never resumes an existing sandbox and a conflicting name fails; use `resumeModalNetworkSandboxSession({ sandboxId })` to reattach to a running sandbox or to restore a stopped one. See [Stopping and resuming](#stopping-and-resuming).
- Take a network sandbox session's process-restricted subset with `networkSandboxSession.restricted()` and use it with AI SDK tools that accept `experimental_sandbox`.
- Adapt an existing native `Sandbox` with `createModalSandboxSessionFromNativeSandbox({ sandbox, workdir })` and use it with AI SDK tools that accept `experimental_sandbox`. Modal reports a sandbox's working directory and tunnels only through asynchronous calls, so the adaptation takes the `workdir` (and, for `createModalNetworkSandboxSessionFromNativeSandbox()`, the `encryptedPorts`) that the sandbox was created with. A session adapted from a native sandbox does not snapshot it: `stop()` and `destroy()` both terminate it.

## Stopping and resuming

Modal cannot restart a terminated sandbox, so the session keeps a stopped sandbox as a snapshot:

- `stop()` snapshots the sandbox filesystem, publishes the snapshot as a Modal image named after the session `id`, and terminates the sandbox. Running processes are not kept.
- `resumeModalNetworkSandboxSession({ sandboxId })` reattaches to the sandbox when it is still running. Otherwise it starts a new sandbox from the stop snapshot and gives it the same `id`, with the working directory and the rest of the filesystem as `stop()` left them. A harness session that keeps its state in the sandbox, such as Claude Code or Codex, can then be resumed with `createSession({ sandboxSession, sessionId, resumeFrom })`.
- `destroy()` terminates the sandbox and deletes its stop snapshot.

Where this differs from `@ai-sdk/sandbox-vercel`:

- Modal does not keep the configuration of a stopped sandbox. Pass the creation options again when resuming, for example `resumeModalNetworkSandboxSession({ sandboxId, encryptedPorts: [4000], blockNetwork: false })`. They are used only when the sandbox has to be restored, and a restored sandbox without `encryptedPorts` exposes no ports.
- Modal does not keep the network settings of a stopped sandbox either, whether they were set at creation or with `setNetworkPolicy()`, and a restore without them would open all outbound access. `resumeModalNetworkSandboxSession()` therefore refuses to restore a stopped sandbox unless you pass `blockNetwork`, `outboundCidrAllowlist`, or `outboundDomainAllowlist`. `blockNetwork: false` restores it with open outbound access. Reattaching to a sandbox that is still running needs no network settings.
- The restored sandbox is a new Modal sandbox, so its tunnel URLs are new.
- Only `stop()` takes a snapshot. A sandbox that ends another way, for example by reaching `timeoutMs`, cannot be restored from its last state: resuming it restores the snapshot of an earlier `stop()` when there is one, and otherwise fails with `Modal sandbox "<id>" has terminated and cannot be resumed.`
- Modal keeps a snapshot for 30 days. After that the stopped sandbox cannot be resumed. Each `stop()` publishes a new snapshot image, `destroy()` deletes the current one, and earlier ones stay in the Modal account until Modal expires them after 30 days.
- Creating a sandbox with the `sandboxId` of a stopped one starts a fresh sandbox and leaves the old snapshot in place until the next `stop()` or `destroy()`.

`HarnessAgentSession.detach()` and `HarnessAgentSession.stop()` leave a sandbox session that you passed to `createSession()` running; only the sandbox session's own `stop()` and `destroy()` end the sandbox.

## Ports

Expose ports with `encryptedPorts`. The session lists them in `ports` in ascending order, and `getPortEndpoint()` resolves each one to the URL of its Modal tunnel: `https://` by default and `wss://` for `protocol: 'ws'`. The URL can be dialed directly and stays the same for as long as the sandbox runs, including after reattaching with `resumeModalNetworkSandboxSession()`.

Bridge-backed harness adapters such as Claude Code and Codex connect to the first listed port unless they are configured with a `port`.

Modal fixes a sandbox's tunnels when it is created, so the session has no `setPorts()`. Ports exposed with `unencryptedPorts` are not listed, and `h2Ports` is not supported.

## Root user

Modal runs sandbox processes as root, even when the image declares another user. Claude Code only skips its permission prompts as root when `IS_SANDBOX` is set, so pass it to the harness adapter: `createClaudeCode({ env: { IS_SANDBOX: '1' } })`.

## Authentication

Modal accepts `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, or the active profile in `~/.modal.toml` that `modal setup` writes. To configure credentials or the Modal environment in code, pass your own client: `createModalNetworkSandboxSession({ client: new ModalClient({ tokenId, tokenSecret }) })`.

## Network policy

`setNetworkPolicy()` replaces the outbound network policy of the running sandbox through Modal's two allowlists, which Modal combines additively:

- `{ mode: 'allow-all' }` and `{ mode: 'deny-all' }` open and close all outbound access.
- `{ mode: 'custom', allowedHosts, allowedCIDRs }` admits the listed hosts and IPv4 ranges. Hosts may use a `*.` prefix. Modal admits a host only for TLS traffic on port 443, and rejects IPv6 ranges.
- `deniedCIDRs` is not supported, because Modal has no deny list. A policy that sets it fails with a `HarnessCapabilityUnsupportedError`.

Modal only changes the policy of a sandbox that was created with an `outboundDomainAllowlist` and without `blockNetwork`. `createModalNetworkSandboxSession()` therefore creates sandboxes with allowlists that admit everything, unless you pass `blockNetwork`, `outboundCidrAllowlist`, or `outboundDomainAllowlist` yourself. On a sandbox that Modal cannot change, `setNetworkPolicy()` fails with a `HarnessCapabilityUnsupportedError`.

## Credential brokering

The session does not implement request transformations, so bridge-backed harness adapters forward model credentials into the sandbox process instead of brokering them. Each harness adapter's `credentialForwarding` setting controls what the sandbox receives.
