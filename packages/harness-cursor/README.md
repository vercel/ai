# AI SDK - Cursor Harness

`HarnessV1` adapter backed by [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk). The adapter ships a bridge process that runs a **local** Cursor agent inside the sandbox (`local.cwd = sessionWorkDir`) and talks to the host over a WebSocket on a sandbox-proxied loopback port.

## Setup

```bash
npm i @ai-sdk/harness-cursor @ai-sdk/harness @ai-sdk/sandbox-vercel
```

Set `CURSOR_API_KEY` on the host. The bridge receives the key via environment variables at spawn time.

The bridge installs `@cursor/sdk` inside the sandbox the first time a session starts.

## Sandbox requirements

- At least one exposed **port** for the WebSocket bridge
- **Network egress** to the Cursor API
- **Node.js ≥ 22.13** in the sandbox runtime
- **Linux x64** (Cursor SDK ships platform-specific binaries)

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCursor } from '@ai-sdk/harness-cursor';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createCursor({ model: 'composer-2.5' }),
  id: 'demo',
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
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
    prompt: 'Read README.md and summarize the goals.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

Harness-provided skills are written to `$HOME/.cursor/skills/` in the sandbox (not into `sessionWorkDir`).

## v1 limitations

- **Local agents only** — cloud Cursor VMs are not supported
- **No interactive built-in tool approval** — `permissionMode` maps to Cursor `autoReview` only
- **Built-in tool filtering via auto-rejection** — `activeTools` / `inactiveTools` deny inactive built-ins in the bridge stream; may not prevent all SDK side effects
- **Cursor-hosted models** — inference goes through the Cursor API (`CURSOR_API_KEY`)
- **No manual compaction**
