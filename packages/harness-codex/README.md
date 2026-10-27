# AI SDK - Codex Harness

`HarnessV1` adapter backed by the [Codex CLI](https://www.npmjs.com/package/@openai/codex). The adapter runs Codex app-server inside a sandbox and communicates with it over JSON-RPC.

-> **Note**: This package is experimental.

## Setup

```bash
npm i ai @ai-sdk/harness-codex @ai-sdk/harness @ai-sdk/sandbox-vercel zod
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createCodex({
    codexConfig: {
      model_verbosity: 'low',
    },
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
    codex: { reasoningEffort: 'high' },
  },
});
```

See the [Codex Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/codex) for more information.
