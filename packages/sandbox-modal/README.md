# AI SDK - Modal Sandbox

Sandbox session implementation for [Modal Sandboxes](https://modal.com/docs/guide/sandboxes).

-> **Note**: This package is experimental.

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

Sandbox adapters are typically used in combination with [first-party tools](https://ai-sdk.dev/docs/ai-sdk-core/tools) or [the `HarnessAgent` layer](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent). See these docs for more information.
