# AI SDK - Cursor Harness

The **[@ai-sdk/harness-cursor](https://www.npmjs.com/package/@ai-sdk/harness-cursor)** package adapts [Cursor CLI](https://cursor.com/cli) to the AI SDK harness abstraction through the Agent Client Protocol (ACP).

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness-cursor @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { cursor } from '@ai-sdk/harness-cursor';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: cursor,
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

See the [Cursor Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/cursor) for more information.
