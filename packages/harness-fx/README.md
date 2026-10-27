# AI SDK - fx Harness

The **[@ai-sdk/harness-fx](https://www.npmjs.com/package/@ai-sdk/harness-fx)** package adapts [fx](https://fx.sh) to the AI SDK harness abstraction using [libfx](https://www.npmjs.com/package/libfx). The runtime runs on the host, while built-in filesystem and shell tools operate exclusively on the sandbox.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness-fx @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { fx } from '@ai-sdk/harness-fx';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: fx,
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
  template: await agent.getSandboxTemplate(),
});
const session = await agent.createSession({ sandboxSession });

try {
  const result = await agent.generate({
    session,
    prompt: 'Inspect this project and summarize its purpose.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

See the [fx Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx) for more information.
