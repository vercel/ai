# AI SDK - Codex Harness

`HarnessV1` adapter backed by [`@openai/codex-sdk`](https://www.npmjs.com/package/@openai/codex-sdk), which drives the `codex` CLI. The adapter ships a bridge process that runs inside a sandbox and talks to the host over a WebSocket on a sandbox-proxied loopback port.

## Setup

```bash
npm i @ai-sdk/harness-codex @ai-sdk/harness @ai-sdk/sandbox-vercel
```

The bridge installs `@openai/codex-sdk` (and the `codex` CLI it depends on) inside the sandbox the first time the session starts.

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { createVercelHarnessSandbox } from '@ai-sdk/sandbox-vercel/harness';
import { tool } from 'ai';
import { z } from 'zod/v4';

const sandbox = await createVercelHarnessSandbox({
  runtime: 'node24',
  ports: [4000],
});

const agent = new HarnessAgent({
  harness: createCodex(),
  id: 'demo',
  sandbox,
  tools: {
    deploy: tool({
      description: 'Deploy a service.',
      inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
      execute: async ({ env }) => ({ url: `https://${env}.example.com` }),
    }),
  },
  harnessOptions: {
    codex: { reasoningEffort: 'high' },
  },
});
```

> Codex does not auto-discover a skills directory the way the `claude` CLI
> does, so when you supply `skills: [...]` on the factory the adapter
> injects every skill inline into the user prompt on each turn. Use fewer,
> larger skills rather than many tiny ones.

```ts
const agent = new HarnessAgent({
  harness: createCodex({
    skills: [
      { name: 'haiku-mode', description: 'Answer in haikus.', content: '...' },
    ],
  }),
  sandbox,
});

try {
  const result = await agent.generate({
    prompt: 'List the files in this workspace and describe their purpose.',
  });
  console.log(result.text);
} finally {
  await agent.close();
}
```

The adapter requires a sandbox that implements `HarnessV1Sandbox.getPortUrl` — `VercelHarnessSandbox` from `@ai-sdk/sandbox-vercel/harness` is the supported choice today.
