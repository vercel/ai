# AI SDK - Vercel Sandbox

AI SDK sandbox implementation backed by [`@vercel/sandbox`](https://vercel.com/docs/vercel-sandbox). Two entry points are provided: a base `VercelSandbox` implementing `Experimental_Sandbox`, and a `VercelHarnessSandbox` implementing `HarnessV1Sandbox` with `getPortUrl` and `setNetworkPolicy` for harness adapters.

## Setup

```bash
npm i @ai-sdk/sandbox-vercel @vercel/sandbox
```

## Usage

```ts
import { VercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';

const sandbox = new VercelSandbox(
  await Sandbox.create({ runtime: 'node24', ports: [3000] }),
);

await sandbox.writeTextFile({ path: 'hello.txt', content: 'hi' });
const { stdout } = await sandbox.runCommand({ command: 'cat hello.txt' });
```

For harness adapters that need port exposure and runtime network policy:

```ts
import { VercelHarnessSandbox } from '@ai-sdk/sandbox-vercel/harness';
import { Sandbox } from '@vercel/sandbox';

const sandbox = new VercelHarnessSandbox(
  await Sandbox.create({ runtime: 'node24', ports: [4000] }),
);

const url = await sandbox.getPortUrl({ port: 4000 });
await sandbox.setNetworkPolicy({
  mode: 'allowlist',
  hosts: ['api.example.com'],
});
```
