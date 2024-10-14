import { createTimeoutAbortSignal } from './create-timeout-abort-signal';
import { InvalidArgumentError } from '../errors';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should throw an error when timeoutMs is undefined', () => {
  expect(() => createTimeoutAbortSignal(undefined)).toThrow(
    InvalidArgumentError,
  );
});

it('should throw an error when timeoutMs is 0 or negative', () => {
  expect(() => createTimeoutAbortSignal(0)).toThrow(InvalidArgumentError);
  expect(() => createTimeoutAbortSignal(-1000)).toThrow(InvalidArgumentError);
});

it('should create an AbortSignal that aborts after the specified timeout', () => {
  const { signal, clearTimeoutSignal: clear } = createTimeoutAbortSignal(5000);
  expect(signal.aborted).toBe(false);
  vi.advanceTimersByTime(4999);
  expect(signal.aborted).toBe(false);
  vi.advanceTimersByTime(1);
  expect(signal.aborted).toBe(true);
  clear();
});

it('should clear the timeout when clear is called', () => {
  const { signal, clearTimeoutSignal: clear } = createTimeoutAbortSignal(5000);
  vi.advanceTimersByTime(3000);
  clear();
  vi.advanceTimersByTime(2000);
  expect(signal.aborted).toBe(false);
});

it('should handle very large timeout values', () => {
  const { signal, clearTimeoutSignal: clear } = createTimeoutAbortSignal(
    Number.MAX_SAFE_INTEGER,
  );
  vi.advanceTimersByTime(Number.MAX_SAFE_INTEGER - 1);
  expect(signal.aborted).toBe(false);
  vi.advanceTimersByTime(1);
  expect(signal.aborted).toBe(true);
  clear();
});

it('should handle multiple abort listeners', () => {
  const { signal, clearTimeoutSignal: clear } = createTimeoutAbortSignal(1000);
  const listener1 = vi.fn();
  const listener2 = vi.fn();
  signal.addEventListener('abort', listener1);
  signal.addEventListener('abort', listener2);
  vi.advanceTimersByTime(1000);
  expect(listener1).toHaveBeenCalledTimes(1);
  expect(listener2).toHaveBeenCalledTimes(1);
  clear();
});

it('should not trigger abort after clear is called', () => {
  const { signal, clearTimeoutSignal: clear } = createTimeoutAbortSignal(1000);
  const abortListener = vi.fn();
  signal.addEventListener('abort', abortListener);
  vi.advanceTimersByTime(500);
  clear();
  vi.advanceTimersByTime(1000);
  expect(abortListener).not.toHaveBeenCalled();
});
