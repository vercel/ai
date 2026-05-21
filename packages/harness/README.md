# AI SDK - Harness Specification and Agent

Drive third-party coding agent runtimes (Claude Code, Codex, OpenCode, …) through one uniform AI SDK `Agent` API.

This package provides both the specification that harness adapter packages implement, and a `HarnessAgent` class consumers use to run them.

## Setup

```bash
npm i @ai-sdk/harness
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { justBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { tool } from 'ai';
import { z } from 'zod';

const agent = new HarnessAgent({
  harness: claudeCode(),
  id: 'auth-agent',
  system: 'You are a careful refactoring assistant. Prefer minimal diffs.',
  sandbox: justBashSandbox,
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

try {
  const result = await agent.generate({
    prompt: 'Fix the failing test in src/auth.ts',
  });
  console.log(result.text);

  // Streaming
  const stream = await agent.stream({ prompt: 'Now write a regression test' });
  for await (const part of stream.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
} finally {
  await agent.close();
}
```

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

Implement the `HarnessV1` factory and a `HarnessV1Session` whose `doPrompt` emits events; the agent surface, streaming, tool execution, and multi-turn state are handled for you.

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
        doPrompt: async promptOpts => {
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
        doStop: async () => {},
      };
      return session;
    },
  };
}
```
