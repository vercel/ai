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

Modal only changes the policy of a sandbox that was created with an `outboundDomainAllowlist` and without `blockNetwork`. `createModalNetworkSandboxSession()` therefore creates sandboxes with allowlists that admit everything, unless you pass `blockNetwork`, `outboundCidrAllowlist`, or `outboundDomainAllowlist` yourself. On a sandbox that Modal cannot change, `setNetworkPolicy()` fails with a `HarnessCapabilityUnsupportedError`. That includes every sandbox created with `requestTransformations: true`; see [Request transformations and credential brokering](#request-transformations-and-credential-brokering).

## Request transformations and credential brokering

Create the sandbox with `requestTransformations: true` to give the session `setRequestTransformations()` and `addRequestTransformations()`:

```ts
const networkSandboxSession = await createModalNetworkSandboxSession({
  encryptedPorts: [4000],
  requestTransformations: true,
});
```

Bridge-backed harness adapters such as Claude Code and Codex then broker model credentials: the sandbox process receives a placeholder, and Modal attaches the real credential to the request after it has left the sandbox. Without the option the session has neither method, and the adapters forward model credentials into the sandbox process instead. Each harness adapter's `credentialForwarding` setting controls what the sandbox receives.

The option uses Modal's experimental outbound policy (`ExperimentalOutboundPolicy`), which Modal may change. It is off by default for that reason, and because it comes with these limits:

- **A rule applies to its whole host.** Modal replaces headers per host and has no path, method, query string, or header matcher. A rule's `path` and `headers` matchers are accepted, but the rule is applied to every HTTPS request that the sandbox sends to its host. A brokered credential is therefore attached to every request to that host, whether or not the request carries the placeholder, and a program in the sandbox cannot use a different credential of its own for the same host.
- **Rules that Modal cannot express are rejected.** A rule with a `method` or `queryString` matcher fails with a `HarnessCapabilityUnsupportedError`, and so do two rules that set the same header to different values for the same host or for overlapping hosts. Nothing is changed when a rule is rejected. A host is an exact name, a name with a `*.` prefix, which on Modal also matches the name itself, or `*`.
- **No outbound restrictions.** Modal rejects `blockNetwork` and `outboundDomainAllowlist` on a sandbox that uses its outbound policy, and does not apply `outboundCidrAllowlist` to the HTTPS traffic of one. `requestTransformations` therefore cannot be combined with any of the three, and `setNetworkPolicy()` fails with a `HarnessCapabilityUnsupportedError` on such a session.
- **Modal sees the header values.** They are sent to Modal as part of the sandbox's outbound policy. For the hosts that have a rule, Modal terminates TLS with its own certificate authority, which the sandbox is set up to trust, and sends the requests on over HTTP/1.1.

`setRequestTransformations()` replaces the rules of the session and `addRequestTransformations()` adds to them. Adding a rule with the same matchers and header names as an existing rule replaces that rule, which is how a harness adapter refreshes a credential.

Modal does not report the outbound policy of a sandbox, which shows when a sandbox is resumed:

- `resumeModalNetworkSandboxSession()` gives the session of a sandbox that is still running both methods when the sandbox was created with `requestTransformations`. The session does not know the rules that are in place, so its first call replaces them. Harness adapters add their rules again whenever they start or resume a session.
- A stopped sandbox is restored as a new sandbox without rules. Pass the option again, together with the open outbound access it requires: `resumeModalNetworkSandboxSession({ sandboxId, encryptedPorts: [4000], requestTransformations: true, blockNetwork: false })`. A sandbox restored without the option has neither method, and harness adapters forward credentials into it.

A session adapted from a native sandbox has neither method, and `experimentalOutboundPolicy` is not accepted as a creation option. To manage Modal's outbound policy yourself, create the sandbox with the Modal SDK and adapt it.
