const name = 'AI_HarnessBridgeCapabilityUnsupportedError';

/**
 * Signals an unsupported capability discovered inside a sandbox bridge.
 * `isInstance` also recognizes the serialized error shape received by the
 * host, where it can be translated to `HarnessCapabilityUnsupportedError`.
 */
export class HarnessBridgeCapabilityUnsupportedError extends Error {
  readonly harnessId?: string;
  readonly cause?: unknown;

  constructor({
    message,
    harnessId,
    cause,
  }: {
    message: string;
    harnessId?: string;
    cause?: unknown;
  }) {
    super(message);
    Object.defineProperty(this, 'name', { value: name });
    this.harnessId = harnessId;
    this.cause = cause;
  }

  static isInstance(
    error: unknown,
  ): error is HarnessBridgeCapabilityUnsupportedError {
    return (
      error != null &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === name &&
      'message' in error &&
      typeof error.message === 'string'
    );
  }
}
