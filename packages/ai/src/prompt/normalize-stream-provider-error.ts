import { AISDKError } from '@ai-sdk/provider';
import { StreamProviderError } from '../error/stream-provider-error';

/**
 * Normalizes well-formed provider error payloads without changing existing
 * Error instances or malformed/unknown values.
 */
export function normalizeStreamProviderError({
  error,
  provider,
}: {
  error: unknown;
  provider: string;
}): unknown {
  if (
    error instanceof Error ||
    AISDKError.isInstance(error) ||
    StreamProviderError.isInstance(error)
  ) {
    return error;
  }

  const outer = asRecord(error);
  if (outer == null) {
    return error;
  }

  const response = asRecord(outer.response);
  const nestedResponseError = asRecord(response?.error);
  const nestedError = asRecord(outer.error);
  const details = nestedResponseError ?? nestedError ?? outer;

  if (typeof details.message !== 'string') {
    return error;
  }

  const type =
    getString(details.type) ??
    (outer.type !== 'error' ? getString(outer.type) : undefined);
  const code = details.code ?? outer.code;
  const explicitStatusCode =
    getHttpStatusCode(details.statusCode) ??
    getHttpStatusCode(outer.statusCode) ??
    getHttpStatusCode(details.status_code) ??
    getHttpStatusCode(outer.status_code) ??
    getHttpStatusCode(details.status) ??
    getHttpStatusCode(outer.status) ??
    getHttpStatusCode(code);
  const statusCode =
    explicitStatusCode ??
    inferStatusCode({
      provider,
      type,
      code,
      message: details.message,
    });
  const explicitRetryability =
    getBoolean(details.isRetryable) ??
    getBoolean(outer.isRetryable) ??
    getBoolean(details.is_retryable) ??
    getBoolean(outer.is_retryable);

  return new StreamProviderError({
    message: details.message,
    type,
    statusCode,
    isRetryable:
      explicitRetryability ??
      inferRetryability({
        statusCode,
        type,
        code,
        message: details.message,
      }),
    data: error,
  });
}

function inferStatusCode({
  provider,
  type,
  code,
  message,
}: {
  provider: string;
  type: string | undefined;
  code: unknown;
  message: string;
}): number | undefined {
  const discriminator = [type, getStringOrNumber(code)]
    .filter(value => value != null)
    .join(' ')
    .toLowerCase();

  if (
    discriminator.includes('rate_limit') ||
    discriminator.includes('insufficient_quota')
  ) {
    return 429;
  }
  if (
    discriminator.includes('authentication') ||
    discriminator.includes('unauthorized')
  ) {
    return 401;
  }
  if (
    discriminator.includes('permission') ||
    discriminator.includes('forbidden')
  ) {
    return 403;
  }
  if (discriminator.includes('not_found')) {
    return 404;
  }
  if (
    discriminator.includes('invalid') ||
    discriminator.includes('bad_request') ||
    discriminator.includes('context_length')
  ) {
    return 400;
  }
  if (discriminator.includes('timeout')) {
    return 504;
  }
  if (discriminator.includes('overload')) {
    return provider.startsWith('anthropic') ? 529 : 503;
  }
  if (
    discriminator.includes('internal_server') ||
    discriminator.includes('server_error')
  ) {
    return 500;
  }
  if (discriminator.includes('failed_dependency')) {
    return 424;
  }
  if (discriminator.includes('unavailable')) {
    return 503;
  }

  switch (message.trim().toLowerCase()) {
    case 'overloaded':
    case 'overloaded error':
    case 'model overloaded':
      return provider.startsWith('anthropic') ? 529 : 503;
    case 'internal server error':
      return 500;
    case 'service unavailable':
      return 503;
    default:
      return undefined;
  }
}

function inferRetryability({
  statusCode,
  type,
  code,
  message,
}: {
  statusCode: number | undefined;
  type: string | undefined;
  code: unknown;
  message: string;
}): boolean {
  if (
    statusCode != null &&
    (statusCode === 408 ||
      statusCode === 409 ||
      statusCode === 429 ||
      statusCode >= 500)
  ) {
    return true;
  }

  const discriminator = [type, getStringOrNumber(code)]
    .filter(value => value != null)
    .join(' ')
    .toLowerCase();

  if (
    discriminator.includes('overload') ||
    discriminator.includes('rate_limit') ||
    discriminator.includes('insufficient_quota') ||
    discriminator.includes('timeout') ||
    discriminator.includes('unavailable') ||
    discriminator.includes('internal_server') ||
    discriminator.includes('server_error')
  ) {
    return true;
  }

  return [
    'overloaded',
    'overloaded error',
    'model overloaded',
    'internal server error',
    'service unavailable',
  ].includes(message.trim().toLowerCase());
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value != null
    ? (value as Record<string, unknown>)
    : undefined;
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
