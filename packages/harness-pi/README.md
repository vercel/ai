# AI SDK - Pi Harness

`HarnessV1` adapter backed by [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). Pi runs in the host Node.js process and uses the sandbox as a remote filesystem + shell — no bridge process is installed inside the sandbox.

-> **Note**: This package is experimental.

## Setup

```bash
npm i ai @ai-sdk/harness-pi @ai-sdk/harness @ai-sdk/sandbox-vercel zod
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createPi({ thinkingLevel: 'medium' }),
  id: 'demo',
  skills: [
    {
      name: 'careful-refactors',
      description: 'Make minimal diffs and keep tests green.',
      content: 'Prefer changes that touch the fewest files possible.',
    },
  ],
  tools: {
    deploy: tool({
      description: 'Deploy a service.',
      inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
      execute: async ({ env }) => ({ url: `https://${env}.example.com` }),
    }),
  },
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
});
const session = await agent.createSession({ sandboxSession });
try {
  const result = await agent.generate({
    session,
    prompt: 'Read README.md and summarise the goals.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

See the [Pi Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) for more information.
