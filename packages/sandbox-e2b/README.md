# AI SDK - E2B Sandbox

Sandbox session implementation for [E2B](https://e2b.dev/docs).

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/sandbox-e2b
```

## Usage

```ts
import { createE2BNetworkSandboxSession } from '@ai-sdk/sandbox-e2b';

const networkSandboxSession = await createE2BNetworkSandboxSession({
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
