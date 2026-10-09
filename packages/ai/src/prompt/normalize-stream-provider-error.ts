import { AISDKError } from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { StreamProviderError } from '../error/stream-provider-error';

/**
 * Normalizes well-formed provider error payloads without changing existing
 * Error instances or malformed/unknown values.
 */
export function normalizeStreamProviderError(error: unknown): unknown {
  if (
    isError(error) ||
    AISDKError.isInstance(error) ||
    StreamProviderError.isInstance(error)
  ) {
    return error;
  }

  const outer = asRecord(error);
  if (outer == null) {
    return error;
  }

  const providerStreamError = isProviderStreamError(error);
  const details = providerStreamError
    ? outer
    : (asRecord(asRecord(outer.response)?.error) ??
      asRecord(outer.error) ??
      outer);

  if (typeof details.message !== 'string') {
    return error;
  }

  const type = getString(details.type) ?? getString(outer.type);
  const code = getStringOrNumber(details.code) ?? getStringOrNumber(outer.code);
  const explicitStatusCode =
    getHttpStatusCode(details.statusCode) ??
    getHttpStatusCode(outer.statusCode) ??
    getHttpStatusCode(details.status_code) ??
    getHttpStatusCode(outer.status_code) ??
    getHttpStatusCode(details.status) ??
    getHttpStatusCode(outer.status) ??
    getHttpStatusCode(details.code) ??
    getHttpStatusCode(outer.code);
  const messageMetadata = inferExactMessageMetadata(details.message);
  const statusCode = explicitStatusCode ?? messageMetadata?.statusCode;
  const explicitRetryability =
    getBoolean(details.isRetryable) ??
    getBoolean(outer.isRetryable) ??
    getBoolean(details.is_retryable) ??
    getBoolean(outer.is_retryable);

  return new StreamProviderError({
    message: details.message,
    type,
    code,
    statusCode,
    isRetryable:
      explicitRetryability ??
      messageMetadata?.isRetryable ??
      isRetryableStatusCode(statusCode),
    data: providerStreamError ? error.data : error,
  });
}

function inferExactMessageMetadata(
  message: string,
): { statusCode: number; isRetryable: true } | undefined {
  switch (message.trim().toLowerCase()) {
    case 'overloaded':
    case 'overloaded error':
    case 'model overloaded':
      return { statusCode: 503, isRetryable: true };
    case 'internal server error':
      return { statusCode: 500, isRetryable: true };
    case 'service unavailable':
      return { statusCode: 503, isRetryable: true };
    default:
      return undefined;
  }
}

function isRetryableStatusCode(statusCode: number | undefined): boolean {
  return (
    statusCode != null &&
    (statusCode === 408 ||
      statusCode === 409 ||
      statusCode === 429 ||
      statusCode >= 500)
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value != null
    ? (value as Record<string, unknown>)
    : undefined;
}

// `instanceof` misses Error instances created in another JavaScript realm.
function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    Object.prototype.toString.call(value) === '[object Error]'
  );
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getStringOrNumber(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getHttpStatusCode(value: unknown): number | undefined {
  const statusCode =
    typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value;

  return typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
    ? statusCode
    : undefined;
}
