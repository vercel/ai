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

Use `session.detach()` to park a bridge-backed session for later attach, `session.stop()` to save state and stop the sandbox, or `session.destroy()` to clean up without keeping resume state. Bridge-backed adapters such as Claude Code, Codex, OpenCode, and DeepAgents require a network sandbox session that exposes ports — `@ai-sdk/sandbox-vercel` is the supported choice today. `@ai-sdk/sandbox-just-bash` is suitable only for host-runtime or otherwise non-bridge flows, such as Pi.

Set `model` on `HarnessAgent` to select the model used when the harness session
starts. Model identifiers are harness-specific, so `model` accepts any string.

`sandbox` is an optional `HarnessV1SandboxProvider`. When omitted, pass a `HarnessV1NetworkSandboxSession` to every `agent.createSession({ sandboxSession })` call. Use `sandboxConfig` for agent specific sandbox configuration that works independently from the sandbox provider that is used:

- Use `sandboxConfig.onSession` to prepare the acquired sandbox before the harness adapter starts. The hook runs for fresh and resumed sessions, so keep it idempotent.
- Use `sandboxConfig.onBootstrap` for expensive sandbox setup that should be baked into a reusable snapshot, such as installing tools or cloning a large repository. Provide `sandboxConfig.bootstrapHash` with it and change that value whenever the bootstrap output should invalidate the cached snapshot.
- Use `sandboxConfig.workDir` to set a stable working directory for the agent, relative to the sandbox's default working directory; otherwise regular sessions use the existing `<harnessId>-<sessionId>` directory. In that case, the `onBootstrap` callback receives the sandbox's default working directory.

Use `prepareHarnessSandboxTemplate()` to create or refresh the sandbox provider's
own reusable template for one harness before serving traffic. This is the
replacement for `prewarmHarness()`, which remains as a deprecated alias.

Use `prepareSandboxForHarness()` when you own an existing sandbox and want to
prepare it before creating your own snapshot. It applies the selected harness
bootstrap recipes and `sandboxConfig.onBootstrap`, returns the computed
preparation identity and per-harness recipe identities, and leaves snapshotting
or stopping the sandbox to your code. Later, create a sandbox from that snapshot
and pass the native sandbox object to `createVercelSandbox({ sandbox })` for the
`HarnessAgent`. When several bridge-backed harnesses share a caller-provided
sandbox, create that sandbox with one exposed port for each harness. Then pass
each harness's assigned port to that harness's `create*` function.

### Available harnesses

See the [harness adapters documentation](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/harness-adapters).

## Implementing a harness

Implement the `HarnessV1` factory and a `HarnessV1Session` whose `doPromptTurn` emits events; the agent surface, streaming, tool execution, and multi-turn state are handled for you. Read `startOpts.model` for the consumer-selected model and `startOpts.sandboxSession` for the selected network sandbox session. The harness layer stops or destroys sessions it acquires from the provider, while a session passed to `agent.createSession({ sandboxSession })` remains caller-owned. Call `sandboxSession.restricted()` for the tool-safe file-IO/exec/spawn surface.

Each prompt and continuation receives an optional `responseFormat`. JSON
formats carry a caller-provided JSON Schema plus optional name and description;
the adapter must enforce the schema and emit the resulting JSON through normal
text parts. If the runtime cannot honor the format, throw
`HarnessCapabilityUnsupportedError` before starting the turn.

Bootstrap recipe paths may be absolute or relative. Relative `bootstrapDir` and
file paths are resolved against `sandboxSession.defaultWorkingDirectory`.
The framework creates `bootstrapDir` before writing files, and bootstrap
commands always run from that directory. Prefer a relative directory such as
`.harness-bootstrap/my-harness` so bootstrap assets are kept with the sandbox's
snapshot-persistent working tree.

```ts
import type { HarnessV1, HarnessV1Session } from '@ai-sdk/harness';

export function myHarness(): HarnessV1 {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'my-harness',
    builtinTools: {},
    doStart: async startOpts => {
      const usage = {
        inputTokens: { total: 0, noCache: 0 },
        outputTokens: { total: 0, text: 0 },
      };
      const resumeState = {
        type: 'resume-session' as const,
        harnessId: 'my-harness',
        specificationVersion: 'harness-v1' as const,
        data: {},
      };
      const continueState = {
        type: 'continue-turn' as const,
        harnessId: 'my-harness',
        specificationVersion: 'harness-v1' as const,
        data: {},
      };
      const session: HarnessV1Session = {
        sessionId: startOpts.sessionId,
        isResume:
          startOpts.resumeFrom != null || startOpts.continueFrom != null,
        doPromptTurn: async promptOpts => {
          const done = Promise.resolve().then(() => {
            promptOpts.emit({ type: 'text-start', id: 't' });
            promptOpts.emit({ type: 'text-delta', id: 't', delta: 'Hello.' });
            promptOpts.emit({ type: 'text-end', id: 't' });
            promptOpts.emit({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              totalUsage: usage,
            });
          });
          return { submitToolResult: async () => {}, done };
        },
        doContinueTurn: async continueOpts => {
          const done = Promise.resolve().then(() => {
            continueOpts.emit({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              totalUsage: usage,
            });
          });
          return { submitToolResult: async () => {}, done };
        },
        doCompact: async () => {},
        doDetach: async () => resumeState,
        doStop: async () => resumeState,
        doDestroy: async () => {},
        doSuspendTurn: async () => continueState,
      };
      return session;
    },
  };
}
```
