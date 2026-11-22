import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainCancelledPrompt } from './drain-cancelled-prompt';

describe('drainCancelledPrompt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('discards session updates until the cancelled prompt stops', async () => {
    const messages = [
      { kind: 'session_update' },
      { kind: 'session_update' },
      { kind: 'stop' },
    ];
    const nextUpdate = vi.fn(async () => messages.shift()!);

    await expect(
      drainCancelledPrompt({ nextUpdate, timeoutMs: 10_000 }),
    ).resolves.toBeUndefined();
    expect(nextUpdate).toHaveBeenCalledTimes(3);
  });

  it('resolves when the cancelled prompt already stopped', async () => {
    const nextUpdate = vi.fn(async () => ({ kind: 'stop' }));

    await expect(
      drainCancelledPrompt({ nextUpdate, timeoutMs: 10_000 }),
    ).resolves.toBeUndefined();
    expect(nextUpdate).toHaveBeenCalledOnce();
  });

  it('fails when the agent never acknowledges the cancellation', async () => {
    vi.useFakeTimers();
    const nextUpdate = vi.fn(() => new Promise<{ kind: string }>(() => {}));

    const drain = drainCancelledPrompt({ nextUpdate, timeoutMs: 10_000 });
    let settled = false;
    void drain.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(drain).rejects.toThrow(
      'The ACP agent did not acknowledge the cancelled prompt before the next turn.',
    );
  });

  it('stops reading updates once the drain timed out', async () => {
    vi.useFakeTimers();
    const pendingReads: Array<(message: { kind: string }) => void> = [];
    const nextUpdate = vi.fn(
      () =>
        new Promise<{ kind: string }>(resolve => {
          pendingReads.push(resolve);
        }),
    );

    const drain = drainCancelledPrompt({ nextUpdate, timeoutMs: 1_000 });
    const outcome = drain.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(outcome).resolves.toMatchObject({
      message:
        'The ACP agent did not acknowledge the cancelled prompt before the next turn.',
    });

    pendingReads[0]({ kind: 'session_update' });
    await vi.advanceTimersByTimeAsync(0);
    expect(nextUpdate).toHaveBeenCalledOnce();
  });

  it('surfaces an update-stream failure', async () => {
    const failure = new Error('ACP connection closed');

    await expect(
      drainCancelledPrompt({
        nextUpdate: async () => {
          throw failure;
        },
        timeoutMs: 10_000,
      }),
    ).rejects.toBe(failure);
  });
});
