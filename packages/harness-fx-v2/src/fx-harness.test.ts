import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, test, vi } from 'vitest';
import { FX_BUILTIN_TOOLS } from './fx-builtin-tools';
import { createFx, fx } from './fx-harness';
import type * as FxModelRuntimeModule from './fx-model-runtime';
import type { TestModelRuntime } from './test-helpers';

const runtime = vi.hoisted(() => ({
  current: undefined as TestModelRuntime | undefined,
}));

vi.mock('./fx-model-runtime', async importOriginal => ({
  ...(await importOriginal<typeof FxModelRuntimeModule>()),
  createFxModelRuntime: () => runtime.current,
}));

describe('createFx', () => {
  test('creates a HarnessV2 adapter with fx built-in tools', () => {
    const harness = createFx();

    expect(harness.specificationVersion).toBe('harness-v2');
    expect(harness.harnessId).toBe('fx');
    expect(harness.builtinTools).toBe(FX_BUILTIN_TOOLS);
    expect(fx.harnessId).toBe('fx');
  });

  test('runs a HarnessAgent turn with a built-in tool call', async () => {
    const { createTestModelRuntime, readFixture } =
      await import('./test-helpers');
    runtime.current = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-read-file-0.sse.txt' }),
        await readFixture({ name: 'gateway-read-file-1.sse.txt' }),
      ],
    });
    const sandboxSession = await createJustBashNetworkSandboxSession({
      sandboxId: 'sandbox-1',
    });
    await sandboxSession.writeTextFile({
      path: `${sandboxSession.defaultWorkingDirectory}/project/notes.txt`,
      content: 'FIRST LINE\nsecond line\n',
    });
    const agent = new HarnessAgent({
      harness: createFx(),
      sandboxConfig: { workDir: 'project' },
      getSandboxSession: async () => sandboxSession,
    });
    const session = await agent.createSession({ sandboxSession });

    const result = await agent.generate({
      prompt: 'Read notes.txt',
      session,
    });

    expect(result.text).toContain('FIRST LINE');
    expect(result.toolCalls).toMatchObject([
      {
        toolCallId: 'toolu_01BEfCB8M29YcjDxsHPQxXER',
        toolName: 'read_file',
        input: { path: 'notes.txt' },
      },
    ]);
    expect(result.toolResults).toMatchObject([
      { toolCallId: 'toolu_01BEfCB8M29YcjDxsHPQxXER', toolName: 'read_file' },
    ]);
    expect(runtime.current.requests[1].body).toContain('FIRST LINE');
  });
});
