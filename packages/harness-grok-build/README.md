# AI SDK - Grok Build Harness

`HarnessV1` adapter backed by the `grok` CLI (`@xai-official/grok`). The adapter drives `grok agent stdio` over the Agent Client Protocol (ACP/JSON-RPC) through a bridge process that runs inside a sandbox and talks to the host over a WebSocket on a sandbox-proxied loopback port.

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

## Capabilities

The ACP surface streams:

- Text and reasoning, plus tool-call, tool-result, and file-change events.
- Token usage on finish, with a structured finish reason.
- Host-defined (custom) tools via `agent.tools` (executed on the host through an in-sandbox MCP server).
- Built-in tool approvals via the ACP `session/request_permission` flow (`supportsBuiltinToolApprovals: true`); use `permissionMode: 'allow-reads'` or `'allow-edits'`.

ACP approval is synchronous — Grok pauses the turn and waits for the reply on the
same live connection, and per the ACP spec a turn cannot be paused and resumed.
Approval works in single-stream setups (TUI, or a persistent SSE/WebSocket route)
but not in a request/response HTTP route that splits the response across the
approval (the AI SDK `toolApproval: 'user-approval'` pattern). For plain HTTP
routes, use `permissionMode: 'allow-all'`.

## Related

See the [AI SDK harness docs](https://ai-sdk.dev/docs/ai-sdk-harnesses) for sessions, tools, UI, and terminal usage.
