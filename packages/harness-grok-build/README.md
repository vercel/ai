# AI SDK - Grok Build Harness

`HarnessV1` adapter backed by the `grok` CLI (`@xai-official/grok`). The adapter ships a bridge process that runs inside a sandbox and talks to the host over a WebSocket on a sandbox-proxied loopback port.

## Setup

```bash
npm i @ai-sdk/harness-grok-build @ai-sdk/harness @ai-sdk/sandbox-vercel
```

The bridge installs the `grok` CLI inside the sandbox the first time the session starts. This requires network egress for the bootstrap install.

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: grokBuild,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
});

const session = await agent.createSession();

try {
  const result = await agent.generate({
    session,
    prompt: 'In one sentence, what is the capital of France?',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

The adapter requires a `HarnessV1SandboxProvider` whose handles expose at least one TCP port — `@ai-sdk/sandbox-vercel` is the supported choice today.

## Authentication

Authentication is resolved from the host environment and forwarded to the sandbox bridge:

- Direct: `XAI_API_KEY`.
- AI Gateway: `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`.

The CLI maps these internally to `GROK_MODELS_BASE_URL` / `GROK_CODE_XAI_API_KEY`.

## Limitations

The grok CLI's `--output-format streaming-json` surface is narrow:

- Streams reasoning and text only — no tool-call, tool-result, or file-change events, and no token usage.
- Allow-all permission mode only (`supportsBuiltinToolApprovals: false`); the CLI runs with `--always-approve` and executes tools itself.
- No compaction.

## Related

See the [AI SDK harness docs](https://ai-sdk.dev/docs/ai-sdk-harnesses) for sessions, tools, UI, and terminal usage.
