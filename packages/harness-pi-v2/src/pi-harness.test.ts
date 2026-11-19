import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { describe, expect, test, vi } from 'vitest';
import { PI_BUILTIN_TOOLS } from './pi-builtin-tools';
import { createPi, pi } from './pi-harness';
import type * as PiModelRuntimeModule from './pi-model-runtime';
import type { TestModelRuntime } from './test-helpers';

const runtime = vi.hoisted(() => ({
  current: undefined as TestModelRuntime | undefined,
}));

vi.mock('./pi-model-runtime', async importOriginal => ({
  ...(await importOriginal<typeof PiModelRuntimeModule>()),
  createPiModelRuntime: () => runtime.current,
}));

describe('createPi', () => {
  test('creates a HarnessV2 adapter with Pi built-in tools', () => {
    const harness = createPi();

    expect(harness.specificationVersion).toBe('harness-v2');
    expect(harness.harnessId).toBe('pi');
    expect(harness.builtinTools).toBe(PI_BUILTIN_TOOLS);
    expect(pi.harnessId).toBe('pi');
  });

  test('runs a HarnessAgent turn with a built-in tool call', async () => {
    const { createTestModelRuntime } = await import('./test-helpers');
    runtime.current = createTestModelRuntime();
    runtime.current.faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            'write',
            { path: 'hello.txt', content: 'Hello!' },
            { id: 'call-1' },
          ),
        ],
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage('I wrote the file.'),
    ]);
    const sandboxSession = await createJustBashNetworkSandboxSession({
      sandboxId: 'sandbox-1',
    });
    const agent = new HarnessAgent({
      harness: createPi(),
      sandboxConfig: { workDir: 'project' },
      getSandboxSession: async () => sandboxSession,
    });
    const session = await agent.createSession({ sandboxSession });

    const result = await agent.generate({ prompt: 'Write a file', session });

    expect(result.text).toBe('I wrote the file.');
    expect(result.toolCalls).toMatchObject([
      {
        toolCallId: 'call-1',
        toolName: 'write',
        input: { path: 'hello.txt', content: 'Hello!' },
      },
    ]);
    expect(result.toolResults).toMatchObject([
      { toolCallId: 'call-1', toolName: 'write' },
    ]);
    expect(
      await sandboxSession.readTextFile({
        path: `${sandboxSession.defaultWorkingDirectory}/project/hello.txt`,
      }),
    ).toBe('Hello!');
  });
});
