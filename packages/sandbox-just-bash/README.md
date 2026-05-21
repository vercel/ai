# AI SDK - just-bash Sandbox

AI SDK sandbox implementation backed by [`just-bash`](https://github.com/vercel-labs/just-bash), an in-process JavaScript bash environment with a virtual filesystem. File operations and spawned processes share the same in-memory state, so harness bridges can be exercised locally without a hosted sandbox.

## Setup

```bash
npm i @ai-sdk/sandbox-just-bash
```

## Usage

```ts
import { JustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { Sandbox } from 'just-bash';

const sandbox = new JustBashSandbox(await Sandbox.create({ cwd: '/work' }));

await sandbox.writeTextFile({ path: '/work/hello.txt', content: 'hi' });

const { stdout } = await sandbox.runCommand({ command: 'cat /work/hello.txt' });
console.log(stdout); // "hi"
```
