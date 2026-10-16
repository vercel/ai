import type { ProviderFailureReason } from '@ai-sdk/provider';

const marker = Symbol.for('vercel.ai.providerStreamError');

export type ProviderStreamError = {
  readonly message: string;
  readonly type?: string;
  readonly code?: string | number;
  readonly statusCode?: number;
  readonly isRetryable?: boolean;
  /** See `APICallError.failureReason`. */
  readonly failureReason?: ProviderFailureReason;
  readonly data: unknown;
};

/**
 * Adds provider-owned status and retry metadata to a stream error payload
 * without requiring provider packages to depend on AI SDK Core.
 */
export function createProviderStreamError({
  message,
  type,
  code,
  statusCode,
  isRetryable,
  failureReason,
  data,
}: {
  message: string;
  type?: string;
  code?: string | number;
  statusCode?: number;
  isRetryable?: boolean;
  failureReason?: ProviderFailureReason;
  data: unknown;
}): ProviderStreamError {
  const error = {
    message,
    type,
    code,
    statusCode,
    isRetryable,
    // Omitted when unset so existing serialized stream errors stay unchanged.
    ...(failureReason != null ? { failureReason } : {}),
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
