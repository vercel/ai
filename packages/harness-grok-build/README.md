# AI SDK - Grok Build Harness

The **[@ai-sdk/harness-grok-build](https://www.npmjs.com/package/@ai-sdk/harness-grok-build)** package adapts [Grok Build](https://x.ai/cli) to the AI SDK harness abstraction through the Agent Client Protocol (ACP).

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness-grok-build @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: grokBuild,
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
  ports: [4000],
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

See the [Grok Build Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/grok-build) for more information.
