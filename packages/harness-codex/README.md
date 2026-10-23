# AI SDK - Codex Harness

`HarnessV1` adapter backed by the [Codex CLI](https://www.npmjs.com/package/@openai/codex). The adapter runs Codex app-server inside a sandbox and communicates with it over JSON-RPC. A bridge process connects app-server to the host over a WebSocket on a sandbox-proxied loopback port.

## Setup

```bash
npm i @ai-sdk/harness-codex @ai-sdk/harness @ai-sdk/sandbox-vercel
```

The bridge installs the Codex CLI inside the sandbox the first time the session starts.

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

`codexConfig` accepts additional native Codex configuration. Values pass
through as provided, so use the snake_case keys from Codex's `config.toml`
reference. The adapter's managed values take precedence over conflicting
entries.

> Codex does not auto-discover a skills directory the way the `claude` CLI
> does, so when you supply `skills: [...]` on the factory the adapter
> injects every skill inline into the user prompt on each turn. Use fewer,
> larger skills rather than many tiny ones.

```ts
const agent = new HarnessAgent({
  harness: createCodex({
    skills: [
      { name: 'haiku-mode', description: 'Answer in haikus.', content: '...' },
    ],
  }),
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
    prompt: 'List the files in this workspace and describe their purpose.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

The adapter needs a sandbox session with an exposed port. The caller ends the
harness session and sandbox separately.

Codex subagent activity is surfaced as `raw` stream parts carrying the
app-server notifications unchanged. A subagent is announced by a
`subAgentActivity` item (`agentThreadId`, multi-agent v2) or a
`collabAgentToolCall` item (`receiverThreadIds`, multi-agent v1); its own
thread's `turn/started`, `turn/completed`, `item/started`, `item/completed`,
`item/agentMessage/delta`, `thread/tokenUsage/updated` and
`thread/status/changed` notifications follow. Subagents are tracked across
responses, nested subagents included. None of this adds text, tool, step or
usage parts to the main turn. A subagent's calls to the host's own tools fail:
the bridge rejects tool calls from subagent threads.
