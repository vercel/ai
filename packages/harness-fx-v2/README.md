# AI SDK - fx Harness (HarnessV2)

`HarnessV2` adapter that drives durable `HarnessAgent` sessions with fx's agent engine from [`libfx`](https://www.npmjs.com/package/libfx), running in the host process, with fx's kernel tools (`read_file`, `glob_files`, `grep_files`, `edit_file`, `write_file` and `shell`) operating on the session's sandbox. Every turn restores fx's engine from a checkpoint in the session log, and models are reached through AI Gateway (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`).

-> **Note**: This package is experimental.

## Setup

```bash
npm i ai @ai-sdk/harness-fx-v2 @ai-sdk/harness @ai-sdk/sandbox-vercel zod
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { fx } from '@ai-sdk/harness-fx-v2';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: fx,
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

See the [fx Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx) for more information.
