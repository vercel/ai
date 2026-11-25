# AI SDK - ACP Harness

`HarnessV1` adapter backed by an
[Agent Client Protocol](https://agentclientprotocol.com/) version 1 agent.
The adapter ships a bridge process that runs inside a sandbox and talks to the
host over a WebSocket on a sandbox-proxied loopback port.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness-acp @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { readFileSync } from 'node:fs';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createACP } from '@ai-sdk/harness-acp';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const codexACP = createACP({
  harnessId: 'acp-codex',
  source: {
    type: 'npm-locked',
    packageJson: readFileSync(
      new URL('./codex-acp/package.json', import.meta.url),
      'utf8',
    ),
    pnpmLockYaml: readFileSync(
      new URL('./codex-acp/pnpm-lock.yaml', import.meta.url),
      'utf8',
    ),
  },
  executable: 'codex-acp',
  modelMapping: {
    type: 'session-config-option',
    path: 'model',
  },
  // codex-acp reports MCP tool calls with a `{ server, tool, arguments }`
  // raw input.
  resolveHostToolCall: ({ toolCall, serverName, toolNames }) => {
    const rawInput = toolCall.rawInput as
      | { server?: unknown; tool?: unknown; arguments?: unknown }
      | undefined;
    if (
      rawInput?.server !== serverName ||
      typeof rawInput.tool !== 'string' ||
      !toolNames.includes(rawInput.tool) ||
      rawInput.arguments == null ||
      typeof rawInput.arguments !== 'object'
    ) {
      return undefined;
    }
    return {
      toolName: rawInput.tool,
      input: rawInput.arguments as Record<string, unknown>,
    };
  },
  isMcpToolCall: toolCall => toolCall._meta?.is_mcp_tool_call === true,
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
    prompt: 'Inspect this project and summarize its purpose.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

See the [ACP Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/acp) for more information.
