# AI SDK - Claude Code Harness

`HarnessV1` adapter backed by [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk), which drives the `claude` CLI. The adapter ships a bridge process that runs inside a sandbox and talks to the host over a WebSocket on a sandbox-proxied loopback port.

## Setup

```bash
npm i @ai-sdk/harness-claude-code @ai-sdk/harness @ai-sdk/sandbox-vercel
```

The bridge installs `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/claude-code` inside the sandbox the first time the session starts.

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createClaudeCode({
    skills: [
      {
        name: 'careful-refactors',
        description: 'Make minimal diffs and keep tests green.',
        content: 'Prefer changes that touch the fewest files possible.',
      },
    ],
  }),
  id: 'demo',
  tools: {
    deploy: tool({
      description: 'Deploy a service.',
      inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
      execute: async ({ env }) => ({ url: `https://${env}.example.com` }),
    }),
  },
  harnessOptions: {
    'claude-code': {
      thinking: { type: 'adaptive', display: 'summarized' },
    },
  },
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
    prompt: 'Read README.md and summarise the goals.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

The adapter needs a sandbox session with an exposed port. The caller owns the
sandbox lifecycle: ending the harness session does not stop the sandbox.

## Runtime configuration

Use `env` to add environment variables to the Claude Code process. Configured
values override variables inherited from the sandbox bridge process.

```ts
const harness = createClaudeCode({
  env: {
    DEPLOYMENT_ENV: 'staging',
  },
});
```
