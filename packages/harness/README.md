# AI SDK - Harness Specification and Agent

_This package is **experimental**._

`HarnessAgent` implementation plus the underlying harness specification, including an expanded network session sandbox interface to support harness sandbox needs.

## Setup

```bash
npm i @ai-sdk/harness
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';

const agent = new HarnessAgent({
  harness: createClaudeCode(),
  id: 'auth-agent',
  system: 'You are a careful refactoring assistant. Prefer minimal diffs.',
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  onSandboxSession: async ({ session, sessionWorkDir, abortSignal }) => {
    await session.writeTextFile({
      path: `${sessionWorkDir}/README.md`,
      content: 'Workspace notes for this session.',
      abortSignal,
    });
  },
  tools: {
    deploy: tool({
      description: 'Deploy to a target environment',
      inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
      execute: async ({ env }) => ({ url: await deployTo(env) }),
    }),
  },
  harnessOptions: {
    'claude-code': { thinking: 'adaptive' },
  },
});

const session = await agent.createSession();

try {
  const result = await agent.generate({
    session,
    prompt: 'Fix the failing test in src/auth.ts',
  });
  console.log(result.text);

  // Streaming
  const stream = await agent.stream({
    session,
    prompt: 'Now write a regression test',
  });
  for await (const part of stream.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
} finally {
  await session.destroy();
}
```

`sandbox` is a required `HarnessV1SandboxProvider` — the agent calls `provider.createSession()` when a session starts. Use `onSandboxSession` to prepare the acquired sandbox before the harness adapter starts. The hook runs for fresh and resumed sessions, so keep it idempotent. Use `session.detach()` to park a bridge-backed session for later attach, `session.stop()` to save state and stop the sandbox, or `session.destroy()` to clean up without keeping resume state. Bridge-backed adapters (claude-code, codex) require a provider that exposes ports — `@ai-sdk/sandbox-vercel` is the supported choice today. `@ai-sdk/sandbox-just-bash` is suitable only for non-bridge flows.

### Available harnesses

- `@ai-sdk/harness-claude-code`
- `@ai-sdk/harness-codex`
- `@ai-sdk/harness-opencode` (WIP)
- `@ai-sdk/harness-goose` (WIP)
- `@ai-sdk/harness-mastra` (WIP)
- `@ai-sdk/harness-deepagents` (WIP)
- `@ai-sdk/harness-openai-agents` (WIP)
- `@ai-sdk/harness-pi` (WIP)

## Implementing a harness

Implement the `HarnessV1` factory and a `HarnessV1Session` whose `doPrompt` emits events; the agent surface, streaming, tool execution, and multi-turn state are handled for you. Read `startOpts.sandboxSession` for the network sandbox session the agent created and will stop on cleanup. Call `sandboxSession.restricted()` for the tool-safe file-IO/exec/spawn surface.

```ts
import type { HarnessV1, HarnessV1Session } from '@ai-sdk/harness';

export function myHarness(): HarnessV1 {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'my-harness',
    builtinTools: [],
    doStart: async startOpts => {
      const session: HarnessV1Session = {
        sessionId: startOpts.sessionId,
        isResume: false,
        doPromptTurn: async promptOpts => {
          promptOpts.emit({ type: 'text-start', id: 't' });
          promptOpts.emit({ type: 'text-delta', id: 't', delta: 'Hello.' });
          promptOpts.emit({ type: 'text-end', id: 't' });
          promptOpts.emit({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            totalUsage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 0, text: 0, reasoning: undefined },
            },
          });
          return { submitToolResult: async () => {}, done: Promise.resolve() };
        },
        doContinueTurn: async () => ({
          submitToolResult: async () => {},
          done: Promise.resolve(),
        }),
        doCompact: async () => {},
        doStop: async () => ({
          harnessId: 'my-harness',
          specificationVersion: 'harness-v1',
          data: {},
        }),
        doDestroy: async () => {},
        doSuspendTurn: async () => ({
          harnessId: 'my-harness',
          specificationVersion: 'harness-v1',
          data: {},
        }),
      };
      return session;
    },
  };
}
```
