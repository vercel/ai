import type {
  Context,
  Experimental_SandboxSession as SandboxSession,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessAgentSettings } from '../harness-agent-settings';
import { describe, expect, test } from 'vitest';
import { HarnessAgent } from './harness-agent';

const harness: HarnessV2 = {
  specificationVersion: 'harness-v2',
  harnessId: 'mock-v2',
  builtinTools: {},
  drive: async () => {},
};

const getSandboxSession: NonNullable<
  HarnessAgentSettings<typeof harness>['getSandboxSession']
> = async ({ sandboxId: _sandboxId }) => ({}) as SandboxSession;

describe('HarnessAgent', () => {
  test('rejects a harness adapter with a different specification version', () => {
    expect(
      () =>
        new HarnessAgent({
          harness: { specificationVersion: 'harness-v1' },
        } as never),
    ).toThrow(
      'expected `harness.specificationVersion` to be `harness-v2`, received `harness-v1`',
    );
  });

  test('requires a sandbox session resolver', () => {
    expect(() => new HarnessAgent({ harness })).toThrow(
      '`getSandboxSession` is required with HarnessV2',
    );
  });

  test('rejects non-serializable call properties before the scaffold error', async () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    await expect(
      agent.generate({
        prompt: 'hello',
        session: { sessionId: 'session-id', sandboxId: 'sandbox-id' },
        onStart: () => {},
      }),
    ).rejects.toThrow('call option `onStart` must be serializable');

    await expect(
      agent.stream({
        prompt: 'hello',
        session: { sessionId: 'session-id', sandboxId: 'sandbox-id' },
        experimental_sandbox: { readFile: async () => '' } as never,
      }),
    ).rejects.toThrow(
      'call option `experimental_sandbox` must be serializable',
    );

    const callOptions = Object.assign(Object.create({ onStart: () => {} }), {
      prompt: 'hello',
      session: { sessionId: 'session-id', sandboxId: 'sandbox-id' },
    });
    await expect(agent.generate(callOptions as never)).rejects.toThrow(
      'call options must be serializable',
    );
  });

  test('stores the provided world and marks the agent durable', () => {
    const world = {} as World;
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    expect((agent as unknown as { world: World | undefined }).world).toBe(
      world,
    );
    expect((agent as unknown as { isDurable: boolean }).isDurable).toBe(true);
  });

  test('marks the agent non-durable when no world is provided', () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    expect(
      (agent as unknown as { world: World | undefined }).world,
    ).toBeUndefined();
    expect((agent as unknown as { isDurable: boolean }).isDurable).toBe(false);
  });

  test('accepts extended serializable values in call options', async () => {
    const agent = new HarnessAgent<
      HarnessV2,
      ToolSet,
      Context,
      never,
      { timestamp: Date }
    >({ harness, getSandboxSession });

    await expect(
      agent.generate({
        prompt: 'hello',
        session: { sessionId: 'session-id', sandboxId: 'sandbox-id' },
        options: { timestamp: new Date() },
      }),
    ).rejects.toThrow('Not implemented yet');
  });
});
