# @akvilander/ai-sdk-harness-grok

Grok Build harness for AI SDK `HarnessAgent` via `grok agent stdio` (ACP).

Upstream target: `@ai-sdk/harness-grok`.

## Setup

```bash
pnpm add @akvilander/ai-sdk-harness-grok @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { grok } from '@akvilander/ai-sdk-harness-grok';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: grok,
  sandbox: createVercelSandbox({ runtime: 'node24', ports: [4000] }),
});
```

## Authentication

- `XAI_API_KEY` — headless API key auth (`xai.api_key`)
- Without API key — OAuth (`xai.oauth`); run device login in `sandboxConfig.onSession` before the first turn

## Settings

```ts
createGrok({
  model: 'grok-build-0.1',
  auth: { apiKey: process.env.XAI_API_KEY },
  startupTimeoutMs: 120_000,
});
```