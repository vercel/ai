# @ai-sdk/harness-cursor

Cursor sandbox harness for AI SDK `HarnessAgent` via `agent acp` (ACP stdio).

**Note:** Cursor Cloud (`@cursor/sdk`) is not covered — use a separate SDK-style adapter.

## Setup

```bash
pnpm add @ai-sdk/harness-cursor @ai-sdk/harness @ai-sdk/sandbox-vercel
```

Requires `CURSOR_API_KEY` and `VERCEL_OIDC_TOKEN` for sandbox.

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { cursor } from '@ai-sdk/harness-cursor';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: cursor,
  sandbox: createVercelSandbox({ runtime: 'node24', ports: [4000] }),
});
```

## Cursor ACP extensions

```ts
createCursor({
  onAskQuestion: async (question) => {
    // Host app collects user input
    throw new Error(`Need answer: ${question}`);
  },
});
```