import { enhanceAbortSignalWithTimeout } from './enhance-abort-signal-with-timeout';
import { createMergedAbortSignal } from './create-merged-abort-signal';
import { createTimeoutAbortSignal } from './create-timeout-abort-signal';

vi.mock('./create-merged-abort-signal');
vi.mock('./create-timeout-abort-signal');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('enhanceAbortSignalWithTimeout', () => {
  it('should return original signal when timeoutInMs is undefined', () => {
    const signal = new AbortController().signal;
    const result = enhanceAbortSignalWithTimeout({
      signal,
      timeoutInMs: undefined,
    });
    expect(result.signal).toBe(signal);
    expect(result.clearTimeoutSignal).toBeInstanceOf(Function);
  });

  it('should return original signal when signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const result = enhanceAbortSignalWithTimeout({
      signal: controller.signal,
      timeoutInMs: 1000,
    });
    expect(result.signal).toBe(controller.signal);
    expect(result.clearTimeoutSignal).toBeInstanceOf(Function);
  });

  it('should create a timeout signal and merge it with the original signal', () => {
    const mockTimeoutSignal = new AbortController().signal;
    const mockClearTimeoutSignal = vi.fn();
    const mockMergedSignal = new AbortController().signal;

    vi.mocked(createTimeoutAbortSignal).mockReturnValue({
      signal: mockTimeoutSignal,
      clearTimeoutSignal: mockClearTimeoutSignal,
    });

    vi.mocked(createMergedAbortSignal).mockReturnValue(mockMergedSignal);

    const originalSignal = new AbortController().signal;
    const result = enhanceAbortSignalWithTimeout({
      signal: originalSignal,
      timeoutInMs: 5000,
    });

    expect(createTimeoutAbortSignal).toHaveBeenCalledWith(5000);
    expect(createMergedAbortSignal).toHaveBeenCalledWith(
      originalSignal,
      mockTimeoutSignal,
    );
    expect(result.signal).toBe(mockMergedSignal);
    expect(result.clearTimeoutSignal).toBe(mockClearTimeoutSignal);
  });

  it('should work with undefined signal', () => {
    const mockTimeoutSignal = new AbortController().signal;
    const mockClearTimeoutSignal = vi.fn();
    const mockMergedSignal = new AbortController().signal;

    vi.mocked(createTimeoutAbortSignal).mockReturnValue({
      signal: mockTimeoutSignal,
      clearTimeoutSignal: mockClearTimeoutSignal,
    });

    vi.mocked(createMergedAbortSignal).mockReturnValue(mockMergedSignal);

    const result = enhanceAbortSignalWithTimeout({
      signal: undefined,
      timeoutInMs: 5000,
    });

    expect(createTimeoutAbortSignal).toHaveBeenCalledWith(5000);
    expect(createMergedAbortSignal).toHaveBeenCalledWith(
      undefined,
      mockTimeoutSignal,
    );
    expect(result.signal).toBe(mockMergedSignal);
    expect(result.clearTimeoutSignal).toBe(mockClearTimeoutSignal);
  });
});
