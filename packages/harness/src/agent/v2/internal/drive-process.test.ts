import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import {
  getDriveProcess,
  isDriveProcessGone,
  trackRunningDrive,
  type HarnessAgentDriveProcess,
} from './drive-process';

const self = getDriveProcess();

describe.skipIf(self == null)('isDriveProcessGone', () => {
  const current = self as HarnessAgentDriveProcess;

  test('identifies this process once', () => {
    expect(getDriveProcess()).toBe(current);
    expect(current).toEqual({
      pid: process.pid,
      bootId: expect.any(String),
      hostname: expect.any(String),
      startedAt: expect.any(Number),
    });
  });

  test('treats a drive of this process as gone only once it no longer runs', () => {
    const untrack = trackRunningDrive({ driveId: 'drive' });
    expect(isDriveProcessGone({ driveId: 'drive', process: current })).toBe(
      false,
    );
    untrack();
    expect(isDriveProcessGone({ driveId: 'drive', process: current })).toBe(
      true,
    );
  });

  test('treats a live process of another boot as not gone', () => {
    expect(
      isDriveProcessGone({
        driveId: 'drive',
        process: { ...current, bootId: 'other-boot' },
      }),
    ).toBe(false);
  });

  test('treats an exited process as gone', () => {
    const { pid } = spawnSync(process.execPath, ['-e', '']);
    expect(
      isDriveProcessGone({
        driveId: 'drive',
        process: { ...current, pid, bootId: 'other-boot' },
      }),
    ).toBe(true);
  });

  test('treats a reused pid as gone', () => {
    expect(
      isDriveProcessGone({
        driveId: 'drive',
        process: { ...current, bootId: 'other-boot', startedAt: 0 },
      }),
    ).toBe(true);
  });

  test('never judges a process on another host', () => {
    const { pid } = spawnSync(process.execPath, ['-e', '']);
    expect(
      isDriveProcessGone({
        driveId: 'drive',
        process: {
          ...current,
          pid,
          bootId: 'other-boot',
          hostname: `${current.hostname}-other`,
        },
      }),
    ).toBe(false);
  });
});
