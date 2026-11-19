# AI SDK - Pi Harness (HarnessV2)

`HarnessV2` adapter that drives durable `HarnessAgent` sessions with Pi's agent loop ([`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core)), with Pi's built-in tools operating on the session's sandbox. Every drive rebuilds Pi's agent from the session log, and models are reached through AI Gateway (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`).

-> **Note**: This package is experimental.

## Setup

```bash
npm i ai @ai-sdk/harness-pi-v2 @ai-sdk/harness @ai-sdk/sandbox-vercel zod
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi-v2';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: pi,
  getSandboxSession: ({ sandboxId }) =>
    resumeVercelNetworkSandboxSession({ sandboxId }),
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
});
const session = await agent.createSession({ sandboxSession });

const result = await agent.generate({
  session,
  prompt: 'Read README.md and summarise the goals.',
});
console.log(result.text);
```

See the [Pi Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) for more information.
