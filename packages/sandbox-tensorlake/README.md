# AI SDK - Tensorlake Sandbox

_This package is **experimental**._

`HarnessV1SandboxProvider` implementation for [Tensorlake Sandboxes](https://docs.tensorlake.ai/sandboxes/sdk-reference) — stateful execution environments for AI agents with suspend/resume and snapshots.

## Setup

```bash
npm i @ai-sdk/sandbox-tensorlake
```

Authenticate via the `TENSORLAKE_API_KEY` environment variable (get a key at [cloud.tensorlake.ai](https://cloud.tensorlake.ai)) or pass `apiKey` in the settings.

## Usage with a harness

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createTensorlakeSandbox({
    setup: ['npm install -g pnpm@10'], // provision pnpm for the harness
    cpus: 2,
    memoryMb: 4096,
    ports: [4000],
  }),
});

const session = await agent.createSession();
try {
  const result = await agent.stream({
    session,
    prompt: 'Check the test failures and fix the production code.',
  });
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') process.stdout.write(part.text);
  }
} finally {
  await session.destroy();
}
```

### Provisioning the harness's `pnpm` (the `setup` option)

The Claude Code harness bootstraps itself inside the sandbox with `pnpm install`. Tensorlake's default image ships `node`, `npm`, and `git` but **not `pnpm`**. The simplest fix is the `setup` option — shell commands run **as root** once, right after the sandbox is created:

```ts
createTensorlakeSandbox({
  setup: ['npm install -g pnpm@10'], // runs as root → lands in /usr/bin
  cpus: 2,
  memoryMb: 4096,
});
```

Setup runs as root because the default run user (`tl-user`) cannot write to system `PATH` directories; installing there as root makes `pnpm` executable by that user. A non-zero exit aborts session creation. With a snapshot recipe (`identity` + `onFirstCreate`), setup runs on the template before the checkpoint, so the provisioned tools are baked into every forked session and don't re-run per session.

Prefer a prebuilt image instead? Build one once with the `tensorlake` `Image` API and pass `image` (no `setup` needed):

```ts
import { Image } from 'tensorlake';

await new Image({
  name: 'claude-harness',
  baseImage: 'tensorlake/ubuntu-minimal',
})
  .run('apt-get update && apt-get install -y curl git ca-certificates')
  .run(
    'curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs',
  )
  .run('npm install -g pnpm@10')
  .build({ registeredName: 'claude-harness' });

createTensorlakeSandbox({ image: 'claude-harness', cpus: 2, memoryMb: 4096 });
```

## Direct usage

The factory is synchronous. The returned provider is stable; the actual `tensorlake` `Sandbox` is created on demand inside `provider.createSession()`.

```ts
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';

const tensorlakeSandbox = createTensorlakeSandbox({
  cpus: 2,
  memoryMb: 4096,
  ports: [3000],
});

const networkSandboxSession = await tensorlakeSandbox.createSession();
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({
  path: '/home/tl-user/hello.txt',
  content: 'hi',
});

const { stdout } = await sandboxSession.run({
  command: 'cat /home/tl-user/hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.stop();
```

The default sandbox image runs as the non-root user `tl-user`, so the harness composes session paths under its home, `/home/tl-user` (the default working directory). `/root` and a not-yet-created `/workspace` are not writable by that user. If you supply a custom `image` whose default user/home differ, set `workingDirectory` to a path that user can write:

```ts
const sandbox = createTensorlakeSandbox({
  image: myCustomImage, // runs as root
  workingDirectory: '/workspace',
});
```

`networkSandboxSession.restricted()` is typed as `Experimental_SandboxSession`, so it's safe to pass to AI SDK tools that accept `experimental_sandbox`. The network sandbox session itself carries the infra surface (`ports`, `getPortUrl`, `setPorts`, `stop`) that only the harness should reach for.

The create-time settings are forwarded directly to `tensorlake`'s `Sandbox.create`, so every option Tensorlake supports is available (`image`, `cpus`, `memoryMb`, `gpus`, `timeoutSecs`, `snapshotId`, …), plus one adapter-specific field:

- `ports` — extra in-sandbox ports to advertise on the session, reachable from the host via `getPortUrl`. The harness bridge port is advertised automatically, so this is only needed to reach additional services the agent starts.

### How the harness reaches the sandbox (tunnels)

The harness runs a WebSocket bridge inside the sandbox and connects to it from the host using `getPortUrl`. Tensorlake's public ingress (`https://<port>-<id>.sandbox.tensorlake.ai`) requires a Tensorlake credential on every request, which the harness cannot supply. So `getPortUrl` instead opens a `tensorlake` **TCP tunnel** — an authenticated WebSocket the SDK secures with your API key — and returns a `127.0.0.1` URL. The harness connects to localhost; the tunnel forwards to the in-sandbox port. Tunnels are cached per port and closed when the session stops.

This means `getPortUrl` returns a host-local URL (great for the harness and local access), not a shareable public URL. For a public URL, read `sandbox.info().sandboxUrl` after exposing the port yourself.

### Outbound network policy

Tensorlake fixes egress at create time and cannot change it on a running sandbox, so this adapter does not implement mid-session `setNetworkPolicy`. Configure egress when constructing the provider:

```ts
const sandbox = createTensorlakeSandbox({
  allowInternetAccess: false,
  allowOut: ['api.example.com'],
  denyOut: ['169.254.169.254'],
});
```

### Wrapping an existing sandbox

To wrap an already-created `tensorlake` `Sandbox` — e.g. to share one sandbox across multiple harness sessions or to construct it with options outside the factory — pass it via `sandbox`. The session's `stop()` and `destroy()` become no-ops; the caller owns the lifecycle.

```ts
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';
import { Sandbox } from 'tensorlake';

const tensorlakeSandbox = createTensorlakeSandbox({
  sandbox: await Sandbox.create({ cpus: 2, name: 'shared-env' }),
  ports: [3000],
});
```

## Sessions and resume

When the harness supplies a `sessionId`, the provider names the sandbox deterministically and `stop()` suspends it (named sandboxes are resumable). A later `resumeSession({ sessionId })` locates the sandbox by name via `Sandbox.list()`, reconnects, and resumes it.

When the harness supplies a snapshot recipe (`identity` + `onFirstCreate`), the provider runs the one-time setup once per identity, `checkpoint()`s a snapshot, and forks an ephemeral session sandbox from that snapshot on each `createSession`.
