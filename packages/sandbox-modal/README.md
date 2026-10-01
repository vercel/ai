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

Sandboxes are terminated after 30 minutes unless `timeoutMs` says otherwise. A terminated Modal sandbox cannot be started again: `stop()` and `destroy()` both terminate it.

Unlike `@ai-sdk/sandbox-vercel`, `stop()` does not keep the sandbox resumable. Once the sandbox session's `stop()` or `destroy()` has run, or the sandbox has reached its `timeoutMs`, the sandbox and the working directory that Claude Code and Codex keep their conversation state in are gone: the harness session cannot be resumed, and `resumeModalNetworkSandboxSession()` fails with `Modal sandbox "<id>" has terminated and cannot be resumed.` A harness session stays resumable only while the Modal sandbox keeps running. `HarnessAgentSession.detach()` and `HarnessAgentSession.stop()` leave a sandbox session that you passed to `createSession()` running, so reattach with `resumeModalNetworkSandboxSession({ sandboxId })` and `createSession({ sandboxSession, sessionId, resumeFrom })` before the sandbox is stopped or times out.

### Use cases

- Create a network sandbox session with `createModalNetworkSandboxSession()` and pass it to `HarnessAgent.createSession({ sandboxSession })`. For reusable templates, pass `template: await agent.getSandboxTemplate()` to the creator function. The prepared filesystem is published as a Modal image named after the template, and later sandboxes start from it.
- Set `sandboxId` to name a new sandbox, or persist the returned session's `id`. Creation never resumes an existing sandbox and a conflicting name fails; use `resumeModalNetworkSandboxSession({ sandboxId })` to reattach to a running sandbox by its name or by its Modal sandbox ID.
- Take a network sandbox session's process-restricted subset with `networkSandboxSession.restricted()` and use it with AI SDK tools that accept `experimental_sandbox`.
- Adapt an existing native `Sandbox` with `createModalSandboxSessionFromNativeSandbox({ sandbox, workdir })` and use it with AI SDK tools that accept `experimental_sandbox`. Modal reports a sandbox's working directory and tunnels only through asynchronous calls, so the adaptation takes the `workdir` (and, for `createModalNetworkSandboxSessionFromNativeSandbox()`, the `encryptedPorts`) that the sandbox was created with.

## Ports

Expose ports with `encryptedPorts`. The session lists them in `ports` in ascending order, and `getPortEndpoint()` resolves each one to the URL of its Modal tunnel: `https://` by default and `wss://` for `protocol: 'ws'`. The URL can be dialed directly and stays the same for the lifetime of the sandbox, including after reattaching with `resumeModalNetworkSandboxSession()`.

Bridge-backed harness adapters such as Claude Code and Codex connect to the first listed port unless they are configured with a `port`.

Modal fixes a sandbox's tunnels when it is created, so the session has no `setPorts()`. Ports exposed with `unencryptedPorts` are not listed, and `h2Ports` is not supported.

## Root user

Modal runs sandbox processes as root, even when the image declares another user. Claude Code only skips its permission prompts as root when `IS_SANDBOX` is set, so pass it to the harness adapter: `createClaudeCode({ env: { IS_SANDBOX: '1' } })`.

## Authentication

Modal accepts `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, or the active profile in `~/.modal.toml` that `modal setup` writes. To configure credentials or the Modal environment in code, pass your own client: `createModalNetworkSandboxSession({ client: new ModalClient({ tokenId, tokenSecret }) })`.

## Network access and credential brokering

Restrict outbound access when the sandbox is created with Modal's `blockNetwork`, `outboundCidrAllowlist`, and `outboundDomainAllowlist` options. The session does not implement `setNetworkPolicy()`.

The session does not implement request transformations either, so bridge-backed harness adapters forward model credentials into the sandbox process instead of brokering them. Each harness adapter's `credentialForwarding` setting controls what the sandbox receives.
