import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAbortTimeout } from './set-abort-timeout';

describe('setAbortTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not abort the controller before the timeout elapses', () => {
    const controller = new AbortController();

    setAbortTimeout({ controller, label: 'Step', ms: 100 });
    vi.advanceTimersByTime(99);

    expect(controller.signal.aborted).toBe(false);
  });

  it('should abort the controller when the timeout elapses', () => {
    const controller = new AbortController();

    setAbortTimeout({ controller, label: 'Step', ms: 100 });
    vi.advanceTimersByTime(100);

    expect(controller.signal.aborted).toBe(true);
  });

  it('should abort with a TimeoutError DOMException', () => {
    const controller = new AbortController();

    setAbortTimeout({ controller, label: 'Step', ms: 100 });
    vi.advanceTimersByTime(100);

    expect(controller.signal.reason).toBeInstanceOf(DOMException);
    expect((controller.signal.reason as DOMException).name).toBe(
      'TimeoutError',
    );
  });

  it('should include the label and duration in the abort reason message', () => {
    const controller = new AbortController();

    setAbortTimeout({ controller, label: 'Chunk', ms: 250 });
    vi.advanceTimersByTime(250);

    expect((controller.signal.reason as DOMException).message).toBe(
      'Chunk timeout of 250ms exceeded',
    );
  });

  it('should return a timeout id that can be cleared to cancel the abort', () => {
    const controller = new AbortController();

    const id = setAbortTimeout({ controller, label: 'Step', ms: 100 });
    clearTimeout(id);
    vi.advanceTimersByTime(100);

    expect(controller.signal.aborted).toBe(false);
  });
});
