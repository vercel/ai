# Getting Started with the Tensorlake Sandbox and the AI SDK

Run a coding agent (Claude Code) inside a [Tensorlake Sandbox](https://docs.tensorlake.ai/sandboxes/sdk-reference) — a stateful, isolated execution environment — using the AI SDK harness. This guide covers basic setup and usage.

## Prerequisites

- Node.js 22+ and a package manager (`pnpm`, `npm`, or `yarn`)
- A Tensorlake API key — get one at [cloud.tensorlake.ai](https://cloud.tensorlake.ai)
- A model credential for the Claude Code harness — `ANTHROPIC_API_KEY` or `AI_GATEWAY_API_KEY`

## 1. Install

```bash
pnpm add @ai-sdk/sandbox-tensorlake @ai-sdk/harness @ai-sdk/harness-claude-code
```

## 2. Configure credentials

```bash
export TENSORLAKE_API_KEY=...   # or pass `apiKey` in the sandbox settings
export ANTHROPIC_API_KEY=...    # or AI_GATEWAY_API_KEY
```

## 3. Provision `pnpm` for the harness

The Claude Code harness bootstraps itself inside the sandbox with `pnpm install`. Tensorlake's default image ships `node`, `npm`, and `git` but **not `pnpm`**. The simplest fix is the `setup` option — no custom image required. Setup commands run **as root** once, right after the sandbox is created, so `pnpm` lands in `/usr/bin` where the non-root run user can execute it. (Prefer a prebuilt image? See "Sandbox options" below and pass `image` instead.)

## 4. Run the agent

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createTensorlakeSandbox({
    setup: ['npm install -g pnpm@10'], // provisioned as root, once, at create
    cpus: 2,
    memoryMb: 4096,
    ports: [4000], // extra in-sandbox ports to advertise
  }),
});

const session = await agent.createSession();

try {
  const result = await agent.stream({
    session,
    prompt: 'Check the test failures and fix the production code.',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
} finally {
  await session.destroy();
}
```

The factory is synchronous and the returned provider is stable — the actual Tensorlake sandbox is created lazily inside `agent.createSession()`.

## Run it

A ready-to-run version of the snippet above lives in the AI SDK repo at
`examples/ai-functions/src/harness-agent/claude-code/`. From a clone:

```bash
# one-time
pnpm install
pnpm build

# credentials (or put them in examples/ai-functions/.env)
export TENSORLAKE_API_KEY=...
export ANTHROPIC_API_KEY=...        # or AI_GATEWAY_API_KEY

cd examples/ai-functions

# non-streaming: "Write bubble-sort.js that sorts [5, 2, 9, 1, 7] and prints the result, then run it."
pnpm tsx src/harness-agent/claude-code/generate-tensorlake-sandbox.ts

# streaming, token by token
pnpm tsx src/harness-agent/claude-code/stream-tensorlake-sandbox.ts
```

No image build, no `pnpm` preinstall — the `setup` option provisions it at create
time, so the first run is the only setup you do.

## Sandbox options

Create-time settings are forwarded directly to `tensorlake`'s `Sandbox.create`, so every option Tensorlake supports is available:

| Option                                       | Description                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setup`                                      | Shell commands run **as root** once, right after create and before the harness bootstrap. Use to provision tools the base image lacks (e.g. `npm install -g pnpm@10`) without building a custom image. Baked into the snapshot when using a template recipe. |
| `image`                                      | Registered image name. An alternative to `setup` — use one that already includes `pnpm`.                                                                                                                                                                     |
| `cpus`, `memoryMb`, `gpus`                   | Compute resources for the sandbox.                                                                                                                                                                                                                           |
| `timeoutSecs`                                | Sandbox lifetime. Defaults to 30 min (Tensorlake's own default of 10 min is too short for multi-step runs).                                                                                                                                                  |
| `ports`                                      | Extra in-sandbox ports to advertise, reachable from the host via `getPortUrl`. The harness bridge port is advertised automatically.                                                                                                                          |
| `workingDirectory`                           | Path the harness composes session paths under. Defaults to `/home/tl-user`. Set this for custom images whose default user/home differ (e.g. `/workspace` for root images).                                                                                   |
| `allowInternetAccess`, `allowOut`, `denyOut` | Outbound egress policy, fixed at create time.                                                                                                                                                                                                                |

## Wrapping an existing sandbox

To share one sandbox across multiple sessions, or construct it with options outside the factory, pass it via `sandbox`. The session's `stop()` and `destroy()` become no-ops — you own the lifecycle.

```ts
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';
import { Sandbox } from 'tensorlake';

const sandbox = createTensorlakeSandbox({
  sandbox: await Sandbox.create({ cpus: 2, name: 'shared-env' }),
  ports: [3000],
});
```

## Direct usage (without a harness)

You can use the sandbox session directly for arbitrary command execution:

```ts
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';

const sandbox = createTensorlakeSandbox({ cpus: 2, memoryMb: 4096 });

const networkSandboxSession = await sandbox.createSession();
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
