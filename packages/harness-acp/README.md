# AI SDK - ACP Harness

`HarnessV1` adapter backed by an NPM-installed
[Agent Client Protocol](https://agentclientprotocol.com/) version 1 implementation.
The adapter ships a bridge process that runs inside a sandbox and talks to the
host over a WebSocket on a sandbox-proxied loopback port. The configured ACP
implementation runs alongside the bridge inside the sandbox.

## Setup

```bash
npm i @ai-sdk/harness-acp @ai-sdk/harness @ai-sdk/sandbox-vercel
```

The bridge installs the configured ACP implementation inside the sandbox the
first time the session starts.

## Usage

This example connects `HarnessAgent` to Codex ACP using direct OpenAI
authentication:

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createACP } from '@ai-sdk/harness-acp';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const codexACP = createACP({
  harnessId: 'acp-codex',
  implementation: {
    type: 'npm',
    mode: 'simple',
    packageName: '@agentclientprotocol/codex-acp',
    version: '1.1.4',
    executable: 'codex-acp',
    envSources: {
      CODEX_API_KEY: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    },
  },
  permissionModeMapping: {
    'allow-reads': { type: 'session-mode', modeId: 'read-only' },
    'allow-edits': { type: 'session-mode', modeId: 'agent-full-access' },
    'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
  },
  authentication: {
    methodId: 'api-key',
  },
});

const agent = new HarnessAgent({
  harness: codexACP,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
});

const session = await agent.createSession();
try {
  const result = await agent.generate({
    session,
    prompt: 'Inspect this project and summarize its purpose.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

Set `CODEX_API_KEY` or `OPENAI_API_KEY` in the host environment. The adapter
resolves the value when the ACP process starts and does not store it in the
profile. A bridge-backed ACP harness requires a sandbox with at least one
exposed port.
