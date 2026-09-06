---
title: Deep Agents
description: Learn how to use the Deep Agents harness adapter.
---

# Deep Agents Harness

The Deep Agents harness adapter connects `HarnessAgent` to
[Deep Agents](https://github.com/langchain-ai/deepagentsjs), a LangGraph-based agent
runtime. The adapter runs a Node bridge inside the sandbox that drives the
`deepagents` package and streams its `streamEvents` output back to the host over a
sandbox-exposed WebSocket.

<Note>
  Harness packages are **experimental**. Expect breaking changes between
  releases as this early API gets further refined.
</Note>

## Setup

<InstallPackages packages="@ai-sdk/harness @ai-sdk/harness-deepagents @ai-sdk/sandbox-vercel" />

The adapter bootstraps the bridge's Node dependencies (the `deepagents` package
and LangChain) inside the sandbox via `pnpm` when the first session starts.

## Import

```ts
import { deepAgents, createDeepAgents } from '@ai-sdk/harness-deepagents';
```

`deepAgents` is equivalent to `createDeepAgents()` with its default
configuration.

## Basic Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: deepAgents,
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
});

const session = await agent.createSession();

let exitCode = 0;
try {
  const result = await agent.stream({
    session,
    prompt: 'Analyze this codebase and suggest improvements.',
  });

  for await (const part of result.stream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
} catch (err) {
  exitCode = 1;
  console.error(err);
} finally {
  await session.destroy();
  process.exit(exitCode);
}
```

To use this agent, ensure environment variables include `VERCEL_OIDC_TOKEN` for
Vercel Sandbox, and one of the variables listed under
[authentication](#authentication) for the model provider.

## Adapter Settings

Use `createDeepAgents()` to configure the runtime:

```ts
const harness = createDeepAgents({ recursionLimit: 100 });
```

Settings:

- `auth`: authentication mode (`auto`, `anthropic`, or `ai-gateway`) or an
  isolated authentication environment.
- `credentialForwarding`: optional synchronous or asynchronous callback that
  customizes each credential immediately before the harness adapter forwards it
  into a sandbox process. It receives the credential value that would otherwise
  be forwarded (either the real credential or a masked value) and the
  environment variable name used to expose it. This callback only controls the
  value forwarded into the sandbox process. It does not restrict which
  credentials the harness adapter can discover, read, or otherwise access in
  the host process.
- `mcpServers`: MCP server definitions keyed by server name.
- `port`: bridge port override.
- `recursionLimit`: maximum LangGraph super-steps per turn. When omitted, the
  Deep Agents default applies.
- `startupTimeoutMs`: maximum time to wait for the bridge to start.
- `mintBridgeToken`: synchronous function that receives the sandbox id and
  returns the bridge authentication token. By default, the adapter generates a
  random 32-byte token. Custom implementations must return a suitably secret
  token.

## Structured Output

Deep Agents supports schema-backed [`HarnessAgent` structured output](/docs/ai-sdk-harnesses/harness-agent#generate-structured-output).
The adapter applies a per-turn LangChain tool strategy and returns the graph's
validated `structuredResponse` as JSON text.

## Authentication

Deep Agents always drives the Anthropic client. Non-Anthropic models reach it
through AI Gateway's Anthropic-compatible endpoint, which translates to any
model (Gemini, OpenAI, etc.), tool calls included.

The `auth` setting selects how credentials are resolved from the host
environment:

- `auto` (default): use AI Gateway credentials when available, then fall back
  to Anthropic credentials.
- `anthropic`: use Anthropic credentials.
- `ai-gateway`: use AI Gateway credentials.

When the sandbox supports additive request transformations, the bridge receives
placeholders and the adapter injects credentials into matching outbound
requests. Sandboxes without that capability retain direct credential
forwarding.

Supported environment variables:

- `AI_GATEWAY_API_KEY`
- `VERCEL_OIDC_TOKEN`
- `AI_GATEWAY_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`

To run a non-Anthropic model, select `ai-gateway`:

```ts
const harness = createDeepAgents({ auth: 'ai-gateway' });
const agent = new HarnessAgent({
  harness,
  model: 'google/gemini-2.5-flash',
  sandbox,
});
```

Pass an authentication environment to use programmatically resolved
credentials without reading `process.env`:

```ts
const harness = createDeepAgents({
  auth: { ANTHROPIC_API_KEY: await resolveAnthropicToken() },
});
```

The supplied record replaces the host environment for authentication
discovery. Only recognized authentication variables are forwarded.

## Sandbox

Deep Agents requires a network sandbox with at least one exposed port,
e.g. `@ai-sdk/sandbox-vercel`:

```ts
const sandbox = createVercelSandbox({
  runtime: 'node24',
  ports: [4000],
});
```

## Skills

Skills passed to the session are materialized as native Deep Agents skill folders
(`<name>/SKILL.md` plus any attached files) under `$HOME/.agents/skills/` in the
sandbox (outside the work dir, so they can't clash with cloned code), and loaded
via Deep Agents' `skills` option — so the agent loads them on demand and skill
file references resolve. Skills already present under `<workDir>/.agents/skills/`
(e.g. in a cloned repo) are also discovered.

## Built-in Tools

The adapter exposes these Deep Agents built-ins through `agent.tools`:

- `read`
- `write`
- `edit`
- `bash`
- `grep`
- `glob`
- `ls`
- `task`
- `write_todos`

## Known Limitations

- **Resuming a stopped session's conversation** is not supported — after
  `session.stop()`, Deep Agents' in-memory conversation state (LangGraph
  `MemorySaver`) is gone; only the sandbox workspace persists via its snapshot.
  Use `session.detach()` for cross-process handoff or `session.suspendTurn()` for
  turn continuation while keeping the live bridge running.
- **Manual compaction** is not supported.

## Related

- [HarnessAgent](/docs/ai-sdk-harnesses/harness-agent)
- [Harness tools](/docs/ai-sdk-harnesses/tools)
- [Harness adapters](/docs/ai-sdk-harnesses/harness-adapters)
