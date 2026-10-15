# AI SDK - Pi Harness

`HarnessV1` adapter backed by [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). Pi runs in the host Node.js process and uses the sandbox as a remote filesystem + shell — no bridge process is installed inside the sandbox. Pi reads project resources such as `AGENTS.md` and project skills only from the `resources` setting, never from the host or the sandbox.

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

Pi has no in-sandbox bridge, so the supplied session does not need exposed ports. Its built-in tools operate on the sandbox from the host process.

## Authentication

The default `auto` authentication mode uses `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` when available and otherwise falls back to provider credentials such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Use `createPi({ auth: 'ai-gateway' })` or `createPi({ auth: 'anthropic' })` to select a mode explicitly, or pass an isolated authentication environment with `createPi({ auth: { ANTHROPIC_API_KEY: token } })`.

See the [Pi harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) for authentication options, model configuration, tools, skills, MCP, and session lifecycle details.
