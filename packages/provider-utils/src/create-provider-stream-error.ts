import type { APICallError } from '@ai-sdk/provider';

const marker = Symbol.for('vercel.ai.providerStreamError');

export type ProviderStreamError = {
  readonly message: string;
  readonly type?: string;
  readonly code?: string | number;
  readonly statusCode?: number;
  readonly isRetryable?: boolean;
  /** See `APICallError.reason`. */
  readonly reason?: APICallError['reason'];
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
  reason,
  data,
}: {
  message: string;
  type?: string;
  code?: string | number;
  statusCode?: number;
  isRetryable?: boolean;
  reason?: APICallError['reason'];
  data: unknown;
}): ProviderStreamError {
  const error = {
    message,
    type,
    code,
    statusCode,
    isRetryable,
    // Omitted when unset so existing serialized stream errors stay unchanged.
    ...(reason != null ? { reason } : {}),
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
