# AI SDK - just-bash Sandbox

AI SDK sandbox implementation backed by [`just-bash`](https://github.com/vercel-labs/just-bash), an in-process JavaScript bash environment with a virtual filesystem. File operations and spawned processes share the same in-memory state, so harness bridges can be exercised locally without a hosted sandbox.

## Setup

```bash
npm i @ai-sdk/sandbox-just-bash
```

## Usage

```ts
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';

const sandbox = await createJustBashSandbox({ cwd: '/work' });

await sandbox.writeTextFile({ path: '/work/hello.txt', content: 'hi' });

const { stdout } = await sandbox.runCommand({ command: 'cat /work/hello.txt' });
console.log(stdout); // "hi"
```

To wrap an already-created `just-bash` `Sandbox` (e.g. with a custom `fs`),
pass it via `sandbox`:

```ts
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { OverlayFs, Sandbox } from 'just-bash';

const overlay = new OverlayFs({ root: process.cwd() });
const sandbox = await createJustBashSandbox({
  sandbox: await Sandbox.create({ fs: overlay, cwd: overlay.getMountPoint() }),
});
```
