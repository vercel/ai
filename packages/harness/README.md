# AI SDK - Harness Specification and Agent

_This package is **experimental**._

`HarnessAgent` implementation plus the underlying harness specification, including an expanded network session sandbox interface to support harness sandbox needs.

## Setup

```bash
npm i ai zod @ai-sdk/harness @ai-sdk/harness-claude-code @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: claudeCode,
  id: 'auth-agent',
  model: 'claude-sonnet-4-5',
  instructions:
    'You are a careful refactoring assistant. Prefer minimal diffs.',
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  sandboxConfig: {
    bootstrapHash: 'ripgrep-v1',
    onBootstrap: async ({ session, abortSignal }) => {
      const streamResult = await session.run({
        command:
          'command -v rg >/dev/null || (apt-get update && apt-get install -y ripgrep)',
        abortSignal,
      });
      if (result.exitCode !== 0) {
        throw new Error(`Failed to install ripgrep: ${result.stderr}`);
      }
    },
    onSession: async ({ session, sessionWorkDir, abortSignal }) => {
      await session.writeTextFile({
        path: `${sessionWorkDir}/README.md`,
        content: 'Workspace notes for this session.',
        abortSignal,
      });
    },
  },
  tools: {
    deploy: tool({
      description: 'Deploy to a target environment',
      inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
      execute: async ({ env }) => ({ url: `https://${env}.example.com` }),
    }),
  },
});

const session = await agent.createSession();

try {
  const generateResult = await agent.generate({
    session,
    prompt: 'Fix the failing test in src/auth.ts',
  });
  console.log(generateResult.text);

  // Streaming
  const streamResult = await agent.stream({
    session,
    prompt: 'Now write a regression test',
  });
  for await (const part of streamResult.stream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
} finally {
  await session.destroy();
}
```

Set `output` on `HarnessAgent` to require the same typed, schema-backed output
on every turn. `generate()` exposes the validated value as `result.output`, and
`stream()` additionally exposes `partialOutputStream`; the JSON also remains on
the normal text and stream surfaces.

```ts
import { Output } from 'ai';

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  output: Output.object({
    schema: z.object({ answer: z.string() }),
  }),
});
```

## Documentation

- [Detailed usage documentation](https://ai-sdk.dev/docs/ai-sdk-harnesses)
- [Harness abstraction architecture](https://github.com/vercel/ai/blob/main/architecture/harness-abstraction.md)
- [Sandbox abstraction architecture](https://github.com/vercel/ai/blob/main/architecture/sandbox-abstraction.md)
