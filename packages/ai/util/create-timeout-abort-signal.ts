import { InvalidArgumentError } from '../errors';

export function createTimeoutAbortSignal(timeoutInMs: number | undefined): {
  signal: AbortSignal;
  clearTimeoutSignal: () => void;
} {
  if (timeoutInMs == null) {
    throw new InvalidArgumentError({
      message: 'Timeout cannot be undefined',
      parameter: 'timeoutInMs',
      value: timeoutInMs,
    });
  }

  if (timeoutInMs <= 0) {
    throw new InvalidArgumentError({
      message: 'Timeout must be greater than 0',
      parameter: 'timeoutMs',
      value: timeoutInMs,
    });
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutInMs);

  return {
    signal: timeoutController.signal,
    clearTimeoutSignal: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}
