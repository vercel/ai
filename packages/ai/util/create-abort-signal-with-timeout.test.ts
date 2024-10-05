import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import { createAbortSignalWithTimeout } from './create-abort-signal-with-timeout';

describe('createAbortSignalWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return undefined signal when no parameters are provided', () => {
    const { signal, clearTimeout } = createAbortSignalWithTimeout();
    expect(signal).toBeUndefined();
    expect(clearTimeout).toBeInstanceOf(Function);
  });

  it('should return the provided signal when no timeout is set', () => {
    const originalSignal = new AbortController().signal;
    const { signal } = createAbortSignalWithTimeout({ signal: originalSignal });
    expect(signal).toBe(originalSignal);
  });

  it('should abort after the specified timeout', () => {
    const { signal, clearTimeout } = createAbortSignalWithTimeout({ timeoutMs: 1000 });
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(999);
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal?.aborted).toBe(true);
    clearTimeout();
  });

  it('should clear the timeout when clearTimeout is called', () => {
    const { signal, clearTimeout } = createAbortSignalWithTimeout({ timeoutMs: 1000 });
    vi.advanceTimersByTime(500);
    clearTimeout();
    vi.advanceTimersByTime(1000);
    expect(signal?.aborted).toBe(false);
  });

  it('should return immediately aborted signal if provided signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const { signal } = createAbortSignalWithTimeout({ signal: controller.signal, timeoutMs: 1000 });
    expect(signal?.aborted).toBe(true);
  });

  it('should abort when the provided signal is aborted, even before timeout', () => {
    const controller = new AbortController();
    const { signal } = createAbortSignalWithTimeout({ signal: controller.signal, timeoutMs: 1000 });
    vi.advanceTimersByTime(500);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it('should not create a timeout when timeoutMs is undefined', () => {
    const { signal } = createAbortSignalWithTimeout({});
    vi.advanceTimersByTime(10000);
    expect(signal?.aborted).toBe(undefined);
  });

  it('should handle very large timeout values', () => {
    const { signal } = createAbortSignalWithTimeout({ timeoutMs: Number.MAX_SAFE_INTEGER });
    vi.advanceTimersByTime(Number.MAX_SAFE_INTEGER);
    expect(signal?.aborted).toBe(true);
  });

  it('should not create a timeout when timeoutMs is 0 or negative', () => {
    const { signal: signal0 } = createAbortSignalWithTimeout({ timeoutMs: 0 });
    const { signal: signalNeg } = createAbortSignalWithTimeout({ timeoutMs: -1000 });
    vi.advanceTimersByTime(10000);
    expect(signal0?.aborted).toBe(undefined);
    expect(signalNeg?.aborted).toBe(undefined);
  });

  it('should handle multiple abort listeners', () => {
    const { signal } = createAbortSignalWithTimeout({ timeoutMs: 1000 });
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    signal?.addEventListener('abort', listener1);
    signal?.addEventListener('abort', listener2);
    vi.advanceTimersByTime(1000);
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should not trigger timeout if aborted by original signal', () => {
    const controller = new AbortController();
    const { signal, clearTimeout } = createAbortSignalWithTimeout({ signal: controller.signal, timeoutMs: 1000 });
    const timeoutListener = vi.fn();
    signal?.addEventListener('abort', timeoutListener);
    controller.abort();
    vi.advanceTimersByTime(1000);
    expect(timeoutListener).toHaveBeenCalledTimes(1);
    clearTimeout(); 
  });
});