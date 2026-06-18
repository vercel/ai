# @ai-sdk/harness-deepagents

A [HarnessV1](../harness) adapter that runs [DeepAgents](https://github.com/deep-agents/deepagents)
(a LangGraph-based agent) as a coding-agent runtime inside an AI SDK sandbox.

DeepAgents is Python-based, so this is a **bridge-backed** harness: the runtime
runs inside the sandbox via a Python bridge (`python3 bridge.py`) that speaks the
harness-v1 wire protocol, while the host adapter drives turns over a WebSocket.

> **Status: scaffolding.** The package structure, host adapter shape, built-in
> tool definitions, and auth resolution are in place. The session lifecycle
> (`doStart`) and the Python bridge are not implemented yet — see the plan for
> the phased rollout (happy-path single/multi-turn first; detach/resume/approvals
> follow up).

## Setup

```bash
pnpm add @ai-sdk/harness-deepagents @ai-sdk/harness
```

Requires a sandbox image with `python3.13` available; the harness installs the
Python dependencies (`requirements.txt`) into its bootstrap directory at startup.

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';

const agent = new HarnessAgent({
  harness: deepAgents,
  // ...sandbox provider configuration
});
```

Configure the model and auth via `createDeepAgents({ model, auth })`.

## Auth

Auth is optional. With none configured the adapter falls back to the ambient
Vercel AI Gateway credentials (`AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN`),
then ambient `ANTHROPIC_*`. Pin explicitly with:

```ts
createDeepAgents({
  model: 'claude-sonnet-4',
  auth: { anthropic: { apiKey: process.env.ANTHROPIC_TEAM_KEY } },
});
```

## Built-in tools

| Common name | Native (LangGraph) tool |
| --- | --- |
| `read` | `read_file` |
| `write` | `write_file` |
| `bash` | `shell` |
| `grep` | `search` |

See the [harness docs](https://ai-sdk.dev/docs) for broader concepts.
