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
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const codexACP = createACP({
  harnessId: 'acp-codex',
  source: {
    type: 'npm-simple',
    packageName: '@agentclientprotocol/codex-acp',
    packageVersion: '1.1.4',
  },
  executable: 'codex-acp',
  modelMapping: {
    type: 'session-config-option',
    path: 'model',
  },
  credentialEnv: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
  credentialBrokering: ({ env, sandboxEnv }) => {
    const environmentVariableName = env.CODEX_API_KEY
      ? 'CODEX_API_KEY'
      : 'OPENAI_API_KEY';
    const credential = env[environmentVariableName];
    const sandboxCredential = sandboxEnv?.[environmentVariableName];
    if (!credential || !sandboxCredential) return [];
    return [
      createCredentialRequestTransformation({
        matchUrl: 'https://api.openai.com/v1',
        matchHeaders: {
          Authorization: `Bearer ${sandboxCredential}`,
        },
        transformHeaders: { Authorization: `Bearer ${credential}` },
      }),
    ];
  },
  instructionMapping: {
    type: 'launch-env-json',
    variable: 'CODEX_CONFIG',
    path: ['developer_instructions'],
  },
  permissionModeMapping: {
    'allow-reads': null,
    'allow-edits': null,
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

Set `CODEX_API_KEY` or `OPENAI_API_KEY` in the host environment. Sandboxes that
support additive request transformations receive only credential placeholders;
the real value is injected only when a matching outbound request contains the
expected placeholder. Other sandboxes
retain the legacy behavior of forwarding the value to the ACP process. Codex
ACP supports only `permissionMode: 'allow-all'` because its
restrictive modes enable Codex's internal sandbox. A bridge-backed ACP harness
requires a sandbox with at least one exposed port.

`modelMapping` is required because ACP implementations expose different model
selection operations. Use `session-config-option` with the ACP configuration
option ID as `path`, or `session-model` with the JSON-RPC request property as
`path` for implementations such as Grok Build that use the legacy
`session/set_model` method. No model operation is sent when `HarnessAgent` has
no model and the deprecated `modelId` fallback is also unset.

Use `instructionMapping` when the ACP implementation exposes a native system
or developer prompt. A `session-meta` mapping writes `HarnessAgent`
instructions below the ACP session request's `_meta` field. A
`launch-env-json` mapping merges them into a JSON environment variable before
the implementation starts. Without a mapping, the adapter preserves its
backward-compatible behavior and prepends instructions to the first user
prompt.

Skills are written to `.agents/skills` below the ACP implementation's effective
`$HOME` and discovered natively by the implementation. Set `skillsDirectory`
to another relative path, such as `.claude/skills`, when required by the
implementation.
