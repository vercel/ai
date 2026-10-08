import { describe, expect, it, vi } from 'vitest';
import { createPi } from './pi-harness';
import type { PiCredentialStore } from './pi-auth';
import type * as PiSessionModule from './pi-session';

const mocks = vi.hoisted(() => ({
  createPiSession: vi.fn(
    async (_input: PiSessionModule.CreatePiSessionInput) => ({}),
  ),
}));

vi.mock('./pi-session', async importOriginal => {
  const actual = await importOriginal<typeof PiSessionModule>();
  return { ...actual, createPiSession: mocks.createPiSession };
});

describe('createPi adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createPi();
    expect(harness.harnessId).toBe('pi');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBe(true);
    expect(Object.keys(harness.builtinTools).sort()).toEqual([
      'bash',
      'edit',
      'glob',
      'grep',
      'ls',
      'read',
      'write',
    ]);
    expect(harness.builtinTools.read.nativeName).toBe('read');
    expect(harness.builtinTools.read.commonName).toBe('read');
    expect(harness.builtinTools.read.toolUseKind).toBe('readonly');
    expect(harness.builtinTools.write.toolUseKind).toBe('edit');
    expect(harness.builtinTools.bash.toolUseKind).toBe('bash');
    // `glob` is the common-name key; the native Pi name is `find`.
    expect(harness.builtinTools.glob.nativeName).toBe('find');
    expect(harness.builtinTools.glob.commonName).toBe('glob');
    // `ls` is Pi-specific and intentionally has no common equivalent.
    expect(harness.builtinTools.ls.nativeName).toBe('ls');
    expect(harness.builtinTools.ls.commonName).toBeUndefined();
  });

  it('exposes a lifecycle-state schema', () => {
    const harness = createPi();
    expect(harness.lifecycleStateSchema).toBeDefined();
  });

  it('omits getBootstrap (no in-sandbox install needed)', () => {
    const harness = createPi();
    expect(harness.getBootstrap).toBeUndefined();
  });

  it.each(['continue-turn', 'resume-session'] as const)(
    'forwards %s lifecycle state and stateless runtime settings',
    async resumeStateType => {
      mocks.createPiSession.mockClear();
      const credentials = {} as PiCredentialStore;
      const harness = createPi({
        credentials,
        reattachInProcess: false,
      });
      const lifecycleState = {
        harnessId: 'pi',
        specificationVersion: 'harness-v1',
        data: {},
      } as const;

      const startOptions = {
        sessionId: `session-${resumeStateType}`,
        sandboxSession: {} as never,
        sessionWorkDir: '/sandbox/work',
      };
      if (resumeStateType === 'continue-turn') {
        await harness.doStart({
          ...startOptions,
          continueFrom: { ...lifecycleState, type: 'continue-turn' },
        });
      } else {
        await harness.doStart({
          ...startOptions,
          resumeFrom: { ...lifecycleState, type: 'resume-session' },
        });
      }

      expect(mocks.createPiSession).toHaveBeenCalledWith(
        expect.objectContaining({
          isResume: true,
          resumeStateType,
          settings: expect.objectContaining({
            credentials,
            reattachInProcess: false,
          }),
        }),
      );
    },
  );

  const header = {
    type: 'session',
    version: 3,
    id: 'session-1',
    timestamp: '2026-10-08T00:00:00.000Z',
    cwd: '/sandbox/work',
  };

  it.each([
    {
      name: 'continue-turn entries',
      state: { type: 'continue-turn', data: { entries: [header] } },
      resumeEntries: [header],
    },
    {
      name: 'resume-session entries',
      state: { type: 'resume-session', data: { entries: [header] } },
      resumeEntries: [header],
    },
    {
      name: 'a sessionFileName from an earlier version',
      state: {
        type: 'resume-session',
        data: { sessionFileName: 'x.jsonl' },
      },
      resumeEntries: undefined,
    },
  ] as const)(
    'forwards $name as resumeEntries',
    async ({ state, resumeEntries }) => {
      mocks.createPiSession.mockClear();
      const lifecycleState = {
        ...state,
        harnessId: 'pi',
        specificationVersion: 'harness-v1',
      } as const;

      await createPi().doStart({
        sessionId: 'session-1',
        sandboxSession: {} as never,
        sessionWorkDir: '/sandbox/work',
        ...(lifecycleState.type === 'continue-turn'
          ? { continueFrom: lifecycleState }
          : { resumeFrom: lifecycleState }),
      });

      expect(mocks.createPiSession).toHaveBeenCalledOnce();
      const input = mocks.createPiSession.mock.calls[0]?.[0];
      expect(input).toMatchObject({
        isResume: true,
        resumeStateType: state.type,
      });
      expect(input?.resumeEntries).toEqual(resumeEntries);
    },
  );
});
