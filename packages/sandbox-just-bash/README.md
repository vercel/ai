# AI SDK - just-bash Sandbox

Sandbox session implementation for [`just-bash`](https://github.com/vercel-labs/just-bash), an in-process JavaScript bash environment with a virtual filesystem.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/sandbox-just-bash
```

## Usage

```ts
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';

const networkSandboxSession = await createJustBashNetworkSandboxSession({
  cwd: '/work',
});
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: '/work/hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat /work/hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.destroy();
```

Sandbox adapters are typically used in combination with [first-party tools](https://ai-sdk.dev/docs/ai-sdk-core/tools) or [the `HarnessAgent` layer](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent). See these docs for more information.
