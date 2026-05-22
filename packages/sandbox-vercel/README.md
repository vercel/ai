# AI SDK - Vercel Sandbox

AI SDK sandbox implementation backed by [`@vercel/sandbox`](https://vercel.com/docs/vercel-sandbox). Two entry points are provided: a base `VercelSandbox` implementing `Experimental_Sandbox`, and a `VercelHarnessSandbox` implementing `HarnessV1Sandbox` with `getPortUrl` and `setNetworkPolicy` for harness adapters.

## Setup

```bash
npm i @ai-sdk/sandbox-vercel @vercel/sandbox
```

## Usage

```ts
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const sandbox = await createVercelSandbox({
  runtime: 'node24',
  ports: [3000],
});

await sandbox.writeTextFile({ path: 'hello.txt', content: 'hi' });
const { stdout } = await sandbox.runCommand({ command: 'cat hello.txt' });
```

To wrap an already-created `@vercel/sandbox` `Sandbox` instance (e.g. when you
need credentials or options the factory doesn't expose), pass it via `sandbox`:

```ts
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';

const sandbox = await createVercelSandbox({
  sandbox: await Sandbox.create({ runtime: 'node24', ports: [3000] }),
});
```

For harness adapters that need port exposure and runtime network policy:

```ts
import { createVercelHarnessSandbox } from '@ai-sdk/sandbox-vercel/harness';

const sandbox = await createVercelHarnessSandbox({
  runtime: 'node24',
  ports: [4000],
});

const url = await sandbox.getPortUrl!({ port: 4000 });
await sandbox.setNetworkPolicy!({
  mode: 'allowlist',
  hosts: ['api.example.com'],
});
```
