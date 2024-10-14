import { InvalidArgumentError } from '../errors';

export function createTimeoutAbortSignal(timeoutMs: number | undefined): {
  signal: AbortSignal;
  clear: () => void;
} {
  if (timeoutMs == null) {
    throw new InvalidArgumentError({
      message: 'Timeout cannot be undefined',
      parameter: 'timeoutMs',
      value: timeoutMs,
    });
  }

  if (timeoutMs <= 0) {
    throw new InvalidArgumentError({
      message: 'Timeout must be greater than 0',
      parameter: 'timeoutMs',
      value: timeoutMs,
    });
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  return {
    signal: timeoutController.signal,
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}
