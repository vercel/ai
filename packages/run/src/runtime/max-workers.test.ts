import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunConcurrencyError, run, setMaxWorkers } from '../../dist/index.js';
import {
  getMaxWorkers,
  setMaxWorkers as setSourceMaxWorkers,
} from './max-workers.js';

describe('max workers', () => {
  afterEach(() => {
    setMaxWorkers(undefined);
    setSourceMaxWorkers(undefined);
    vi.restoreAllMocks();
  });

  it('honors an explicit process-wide cap', () => {
    setSourceMaxWorkers(7);
    expect(getMaxWorkers({ memoryLimitBytes: 1, activeWorkers: 0 })).toBe(7);
  });

  it('admits at least one worker and caps the memory heuristic at 32', () => {
    const workerBytes = 64 * 1024 * 1024;
    vi.spyOn(process, 'availableMemory').mockReturnValue(workerBytes - 1);
    expect(
      getMaxWorkers({ memoryLimitBytes: 16 * 1024 * 1024, activeWorkers: 0 }),
    ).toBe(1);

    vi.mocked(process.availableMemory).mockReturnValue(workerBytes * 100);
    expect(
      getMaxWorkers({ memoryLimitBytes: 16 * 1024 * 1024, activeWorkers: 0 }),
    ).toBe(32);
  });

  it('rejects direct run calls while the configured slot is occupied', async () => {
    setMaxWorkers(1);
    let release!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    const first = run({
      source: 'return await tools.block();',
      bindings: {
        tools: {
          block: async () => {
            signalStarted();
            await blocked;
            return true;
          },
        },
      },
    });

    await started;
    await expect(run({ source: 'return 2;' })).rejects.toBeInstanceOf(
      RunConcurrencyError,
    );
    release();
    await expect(first).resolves.toEqual({ status: 'completed', value: true });
  });
});
