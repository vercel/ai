const marker = Symbol.for('vercel.ai.providerStreamError');

export type ProviderStreamError = {
  readonly message: string;
  readonly type?: string;
  readonly statusCode?: number;
  readonly isRetryable?: boolean;
  readonly data: unknown;
};

/**
 * Adds provider-owned status and retry metadata to a stream error payload
 * without requiring provider packages to depend on AI SDK Core.
 */
export function createProviderStreamError({
  message,
  type,
  statusCode,
  isRetryable,
  data,
}: {
  message: string;
  type?: string;
  statusCode?: number;
  isRetryable?: boolean;
  data: unknown;
}): ProviderStreamError {
  const error = {
    message,
    type,
    statusCode,
    isRetryable,
    data,
  };

  Object.defineProperty(error, marker, { value: true });

  return error;
}

export function isProviderStreamError(
  error: unknown,
): error is ProviderStreamError {
  return (
    typeof error === 'object' &&
    error != null &&
    (error as Record<symbol, unknown>)[marker] === true
  );
}
