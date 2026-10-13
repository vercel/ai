# AI SDK - Pi Harness

`HarnessV1` adapter backed by [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). Pi runs in the host Node.js process and uses the sandbox as a remote filesystem + shell — no bridge process is installed inside the sandbox.

## Setup

```bash
npm i @ai-sdk/harness-pi @ai-sdk/harness @ai-sdk/sandbox-vercel
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

Pi has no in-sandbox bridge, so the supplied sandbox session does not need
exposed ports. Vercel and just-bash sessions both work.

## Stateless session configuration

By default, a suspended turn can reuse its live Pi session in the same process.
For stateless or multi-replica applications, set `reattachInProcess: false` so
continuations restore persisted state using the current request's settings.
Application-managed credentials can be supplied through a `PiCredentialStore`;
this replaces Pi's file-backed `auth.json` storage.

```ts
import { createPi, type PiCredentialStore } from '@ai-sdk/harness-pi';

declare const credentials: PiCredentialStore;

const harness = createPi({
  credentials,
  reattachInProcess: false,
});
```

## Inline extensions

Use `extensionFactories` to load trusted inline Pi extensions for each harness session:

```ts
import { createPi } from '@ai-sdk/harness-pi';

const harness = createPi({
  extensionFactories: [
    pi => {
      pi.on('agent_start', () => {
        console.log('Pi agent started');
      });
    },
  ],
});
```

Routine resource refreshes between turns do not reinitialize extension factories. If the underlying Pi session is rebuilt, factories initialize for the new Pi runtime. Extension factories execute in the host Node.js process, so only pass factories you trust. This option does not enable filesystem extension discovery: user, project, personal, and settings-based Pi extensions remain disabled. Themes and prompt templates also remain disabled.
