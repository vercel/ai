import type { World } from '@workflow/world';
import { describe, expect, test } from 'vitest';
import type { HarnessAgentSession } from '../harness-agent-session';
import { releaseSessionDrive, claimSessionDrive } from './session-drives';

const session = (runId: string) => ({ runId }) as HarnessAgentSession;

describe('session drives', () => {
  test('claims a session that is not claimed', () => {
    const world = {} as World;

    expect(claimSessionDrive({ world, session: session('wrun_1') })).toBe(true);
  });

  test('refuses a second claim of a session until it is released', () => {
    const world = {} as World;
    claimSessionDrive({ world, session: session('wrun_1') });

    expect(claimSessionDrive({ world, session: session('wrun_1') })).toBe(
      false,
    );
    releaseSessionDrive({ world, session: session('wrun_1') });
    expect(claimSessionDrive({ world, session: session('wrun_1') })).toBe(true);
  });

  test('tracks the claims of each World separately', () => {
    const world = {} as World;
    const otherWorld = {} as World;
    claimSessionDrive({ world, session: session('wrun_1') });

    expect(
      claimSessionDrive({ world: otherWorld, session: session('wrun_1') }),
    ).toBe(true);
  });
});
