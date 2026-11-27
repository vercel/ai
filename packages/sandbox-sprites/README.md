# AI SDK - Sprites Sandbox

Sandbox session implementation for [Sprites](https://sprites.dev), Fly.io's stateful sandboxes.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/sandbox-sprites
```

## Usage

```ts
import { createSpritesNetworkSandboxSession } from '@ai-sdk/sandbox-sprites';

const networkSandboxSession = await createSpritesNetworkSandboxSession();
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat hello.txt',
});
console.log(stdout); // "hi"

await networkSandboxSession.destroy();
```

See the [Sprites sandbox documentation](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent#sprites-sandboxes) for more information.
