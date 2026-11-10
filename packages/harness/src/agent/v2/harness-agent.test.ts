import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessAgentSettings } from '../harness-agent-settings';
import { describe, expect, test, vi } from 'vitest';
import {
  DefaultHarnessAgentSession,
  type HarnessAgentSession,
} from './harness-agent-session';
import { HarnessAgent } from './harness-agent';
import { InMemoryWorld } from './in-memory-world';
import { HarnessAgent as PublicHarnessAgent } from '../harness-agent';

const harness: HarnessV2 = {
  specificationVersion: 'harness-v2',
  harnessId: 'mock-v2',
  builtinTools: {},
  drive: async () => {},
};

class WorkflowSerializableCallOption {
  constructor(readonly value: string) {}

  static [WORKFLOW_SERIALIZE](instance: WorkflowSerializableCallOption) {
    return { value: instance.value };
  }

  static [WORKFLOW_DESERIALIZE](data: { value: string }) {
    return new WorkflowSerializableCallOption(data.value);
  }
}

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
        session: {
          sessionId: 'session-id',
          sandboxId: 'sandbox-id',
        } as HarnessAgentSession,
        onStart: () => {},
      }),
    ).rejects.toThrow('call option `onStart` must be serializable');

    await expect(
      agent.stream({
        prompt: 'hello',
        session: {
          sessionId: 'session-id',
          sandboxId: 'sandbox-id',
        } as HarnessAgentSession,
        experimental_sandbox: { readFile: async () => '' } as never,
      }),
    ).rejects.toThrow(
      'call option `experimental_sandbox` must be serializable',
    );

    const callOptions = Object.assign(Object.create({ onStart: () => {} }), {
      prompt: 'hello',
      session: {
        sessionId: 'session-id',
        sandboxId: 'sandbox-id',
      } as HarnessAgentSession,
    });
    await expect(agent.generate(callOptions as never)).rejects.toThrow(
      'call options must be serializable',
    );
  });

  test('stores the provided world', () => {
    const world = {} as World;
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    expect((agent as unknown as { world: World | undefined }).world).toBe(
      world,
    );
  });

  test('uses an in-memory world when no world is provided', () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    expect((agent as unknown as { world: World }).world).toBeInstanceOf(
      InMemoryWorld,
    );
  });

  test('stores an explicitly provided in-memory world', () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    expect((agent as unknown as { world: World }).world).toBe(world);
  });

  test.each([
    ['.', '.'],
    ['project', 'project'],
    ['project/app/', 'project/app/'],
    ['project//./app', 'project/app'],
    ['a/../b', 'b'],
  ])(
    'stores the sandbox work directory %j normalized as %j',
    (workDir, expected) => {
      const agent = new HarnessAgent({
        harness,
        getSandboxSession,
        sandboxConfig: { workDir },
      });

      expect(
        (agent as unknown as { sandboxConfig: object }).sandboxConfig,
      ).toEqual({ workDir: expected });
    },
  );

  test('accepts a sandbox work directory through the public HarnessAgent', () => {
    expect(
      () =>
        new PublicHarnessAgent({
          harness,
          getSandboxSession,
          sandboxConfig: { workDir: 'project' },
        }),
    ).not.toThrow();
  });

  test('leaves the work directory unset without one configured', () => {
    const agent = new HarnessAgent({
      harness,
      getSandboxSession,
      sandboxConfig: {},
    });

    expect(
      (agent as unknown as { sandboxConfig: object }).sandboxConfig,
    ).toEqual({});
  });

  test.each(['bootstrapHash', 'onBootstrap', 'onSession'])(
    'rejects the unsupported sandbox setting %s',
    key => {
      expect(
        () =>
          new HarnessAgent({
            harness,
            getSandboxSession,
            sandboxConfig: { workDir: 'project', [key]: undefined },
          }),
      ).toThrow(`setting \`sandboxConfig.${key}\` is not supported`);
    },
  );

  test.each([
    ['', 'must not be empty'],
    ['a\0b', 'must not contain NUL'],
    ['a\\b', 'must use POSIX path separators'],
    ['/abs', 'must be relative'],
    ['./', 'must stay inside the sandbox default working directory'],
    ['a/..', 'must stay inside the sandbox default working directory'],
    ['..', 'must stay inside the sandbox default working directory'],
    ['../outside', 'must stay inside the sandbox default working directory'],
  ])('rejects the sandbox work directory %j', (workDir, message) => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          sandboxConfig: { workDir },
        }),
    ).toThrow(`\`sandboxConfig.workDir\` ${message}`);
  });

  test('still rejects the deprecated onSandboxSession setting', () => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          onSandboxSession: async () => {},
        }),
    ).toThrow('setting `onSandboxSession` is not supported');
  });

  test('creates a session that retains its sandbox session', async () => {
    const sandboxSession = {} as SandboxSession;
    const agent = new HarnessAgent({ harness, getSandboxSession });

    const session = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      sandboxSession,
    });

    expect(session.sessionId).toBe('session-id');
    expect(session.sandboxId).toBe('sandbox-id');
    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
  });

  test('lazily resolves a session created through the public HarnessAgent', async () => {
    const resolvedSandboxSession = {} as SandboxSession;
    const resolveSandboxSession = vi.fn(async () => resolvedSandboxSession);
    const agent = new PublicHarnessAgent({
      harness,
      getSandboxSession: resolveSandboxSession,
    });

    const session = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });

    expect(session.sessionId).toBe('session-id');
    expect(session.sandboxId).toBe('sandbox-id');
    await expect(session.getSandboxSession()).resolves.toBe(
      resolvedSandboxSession,
    );
    expect(resolveSandboxSession).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
  });

  test('uses a provided sandbox session before resolving it by id', async () => {
    const sandboxSession = { id: 'sandbox-id' } as SandboxSession & {
      id: string;
    };
    const resolvedSandboxSession = {} as SandboxSession;
    const resolveSandboxSession = vi.fn(async () => resolvedSandboxSession);
    const agent = new HarnessAgent({
      harness,
      world: {} as World,
      getSandboxSession: resolveSandboxSession,
    });

    const session = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      sandboxSession,
    });

    expect(session.sessionId).toBe('session-id');
    expect(session.sandboxId).toBe('sandbox-id');
    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
    expect(resolveSandboxSession).not.toHaveBeenCalled();
  });

  test('rebinds the session resolver to the current agent on every call', async () => {
    const resolvedSandboxSession = {} as SandboxSession;
    const firstResolver = vi.fn(async () => {
      throw new Error('first agent resolver');
    });
    const currentResolver = vi.fn(async () => resolvedSandboxSession);
    const session = new DefaultHarnessAgentSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });
    const firstAgent = new HarnessAgent({
      harness,
      getSandboxSession: firstResolver,
    });
    const currentAgent = new HarnessAgent({
      harness,
      getSandboxSession: currentResolver,
    });

    await expect(
      firstAgent.generate({ prompt: 'hello', session }),
    ).rejects.toThrow('Not implemented yet');
    await expect(session.getSandboxSession()).rejects.toThrow(
      'first agent resolver',
    );
    await expect(
      currentAgent.stream({ prompt: 'hello', session }),
    ).rejects.toThrow('Not implemented yet');
    await expect(session.getSandboxSession()).resolves.toBe(
      resolvedSandboxSession,
    );
    expect(firstResolver).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
    expect(currentResolver).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
  });

  test('requires a stable sandbox id when creating a session without a sandbox id', async () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    await expect(
      agent.createSession({ sandboxSession: {} as SandboxSession }),
    ).rejects.toThrow(
      'a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`',
    );
    await expect(agent.createSession({})).rejects.toThrow(
      'a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`',
    );
  });

  test('rejects a sandbox id that conflicts with the sandbox session id', async () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    await expect(
      agent.createSession({
        sandboxId: 'provided-id',
        sandboxSession: { id: 'session-id' } as SandboxSession & {
          id: string;
        },
      }),
    ).rejects.toThrow(
      '`sandboxId` must match the sandbox session `id` when one is available',
    );
  });

  test('accepts extended serializable values in call options', async () => {
    const agent = new HarnessAgent<
      HarnessV2,
      ToolSet,
      Context,
      never,
      { timestamp: Date }
    >({ harness, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(
      agent.generate({
        prompt: 'hello',
        session,
        options: { timestamp: new Date() },
      }),
    ).rejects.toThrow('Not implemented yet');
  });

  test('accepts class instances with a Workflow serialization hook', async () => {
    const agent = new HarnessAgent<
      HarnessV2,
      ToolSet,
      Context,
      never,
      { custom: WorkflowSerializableCallOption }
    >({ harness, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(
      agent.generate({
        prompt: 'hello',
        session,
        options: { custom: new WorkflowSerializableCallOption('value') },
      }),
    ).rejects.toThrow('Not implemented yet');
  });
});
