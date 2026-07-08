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

Both paths are supported:

| Path | Host env | ACP auth | Sandbox setup |
|------|----------|----------|---------------|
| **API key** | `XAI_API_KEY` | `xai.api_key` | Key forwarded into sandbox automatically |
| **OAuth** | omit `XAI_API_KEY` | `xai.oauth` | `ensureGrokSandboxOAuth()` in `sandboxConfig.onSession` |

### API key (headless / CI)

```ts
createGrok({ auth: { apiKey: process.env.XAI_API_KEY } });
```

### OAuth (interactive)

```ts
import { ensureGrokSandboxOAuth } from '@akvilander/ai-sdk-harness-grok';

const agent = new HarnessAgent({
  harness: createGrok(), // no auth → xai.oauth
  sandbox,
  sandboxConfig: {
    onSession: async ({ session, sessionWorkDir }) => {
      const oauth = await ensureGrokSandboxOAuth({ session, sessionWorkDir });
      if (!oauth.ready) throw new Error(oauth.question); // contains device login URL
    },
  },
});
```

## Settings

```ts
createGrok({
  model: 'grok-build-0.1',
  auth: { apiKey: process.env.XAI_API_KEY },
  startupTimeoutMs: 120_000,
});
```