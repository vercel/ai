# AI SDK - Cline Harness

`HarnessV1` adapter backed by [`@cline/agents`](https://www.npmjs.com/package/@cline/agents). Cline runs in the host Node.js process and uses the sandbox as a remote filesystem and shell, so no bridge process is installed inside the sandbox.

## Setup

```bash
npm i @ai-sdk/harness-cline @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCline } from '@ai-sdk/harness-cline';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createCline({ reasoningEffort: 'medium' }),
  id: 'demo',
  sandbox: createVercelSandbox({ runtime: 'node24' }),
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

const session = await agent.createSession();
try {
  const result = await agent.generate({
    session,
    prompt: 'Read README.md and summarise the goals.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

The adapter requires a `HarnessV1SandboxProvider`. Cline has no in-sandbox bridge, so the sandbox does not need to expose any ports. Its built-in tools operate on the session sandbox remotely from the host process.

## Authentication

The default `auto` authentication mode uses `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` when available and otherwise falls back to `CLINE_API_KEY`. Use `createCline({ auth: 'ai-gateway' })` or `createCline({ auth: 'direct' })` to select a mode explicitly, or pass an isolated authentication environment with `createCline({ auth: { CLINE_API_KEY: token } })`. `AI_GATEWAY_BASE_URL` and `CLINE_API_BASE_URL` configure their respective endpoints.

See the [Cline harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/cline) for model configuration, reasoning, tools, skills, MCP, and session lifecycle details.
