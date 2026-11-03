# AI SDK - Vercel Sandbox

Sandbox session implementation for [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox).

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const networkSandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
  ports: [3000],
});
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.destroy();
```

Sandbox adapters are typically used in combination with [first-party tools](https://ai-sdk.dev/docs/ai-sdk-core/tools) or [the `HarnessAgent` layer](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent). See these docs for more information.
