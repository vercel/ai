import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import type { HarnessV2 } from '../../v2/harness-v2';
import { describe, expect, test } from 'vitest';
import { HarnessAgent } from './harness-agent';

const harness: HarnessV2 = {
  specificationVersion: 'harness-v2',
  harnessId: 'mock-v2',
  builtinTools: {},
  drive: async () => {},
};

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

  test('rejects non-serializable call properties before the scaffold error', async () => {
    const agent = new HarnessAgent({ harness });

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

  test('accepts extended serializable values in call options', async () => {
    const agent = new HarnessAgent<
      HarnessV2,
      ToolSet,
      Context,
      never,
      { timestamp: Date }
    >({ harness });

    await expect(
      agent.generate({
        prompt: 'hello',
        session: { sessionId: 'session-id', sandboxId: 'sandbox-id' },
        options: { timestamp: new Date() },
      }),
    ).rejects.toThrow('Not implemented yet');
  });
});
