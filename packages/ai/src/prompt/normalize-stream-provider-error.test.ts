import { AISDKError } from '@ai-sdk/provider';
import { createProviderStreamError } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { StreamProviderError } from '../error/stream-provider-error';
import { normalizeStreamProviderError } from './normalize-stream-provider-error';

describe('normalizeStreamProviderError', () => {
  it('normalizes a typed overloaded provider error', () => {
    const data = {
      message: 'Overloaded',
      type: 'overloaded_error',
      code: 'provider_overloaded',
    };

    const error = normalizeStreamProviderError(
      createProviderStreamError({
        message: data.message,
        type: data.type,
        code: data.code,
        statusCode: 529,
        isRetryable: true,
        data,
      }),
    );

    expect(StreamProviderError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Overloaded',
      type: 'overloaded_error',
      code: 'provider_overloaded',
      statusCode: 529,
      isRetryable: true,
      data,
    });
  });

  it('uses provider-owned metadata without exposing the metadata wrapper as data', () => {
    const data = {
      error: {
        message: 'Request too large',
        type: 'request_too_large',
      },
    };

    const error = normalizeStreamProviderError(
      createProviderStreamError({
        message: data.error.message,
        type: data.error.type,
        statusCode: 413,
        isRetryable: false,
        data,
      }),
    );

    expect(error).toMatchObject({
      message: 'Request too large',
      type: 'request_too_large',
      statusCode: 413,
      isRetryable: false,
      data,
    });
  });

  it.each([
    ['Internal server error', 500],
    ['Overloaded', 503],
  ])('normalizes a message-only "%s" provider error', (message, statusCode) => {
    const error = normalizeStreamProviderError({ message });

    expect(error).toMatchObject({
      message,
      type: undefined,
      code: undefined,
      statusCode,
      isRetryable: true,
    });
  });

  it('uses explicit status and retry metadata when available', () => {
    const error = normalizeStreamProviderError({
      message: 'Request rejected',
      type: 'provider_rejection',
      status_code: 422,
      is_retryable: true,
    });

    expect(error).toMatchObject({
      message: 'Request rejected',
      type: 'provider_rejection',
      statusCode: 422,
      isRetryable: true,
    });
  });

  it('normalizes nested response failure payloads', () => {
    const data = {
      type: 'response.failed',
      response: {
        error: {
          code: 'rate_limit_exceeded',
          message: 'Try again later',
        },
      },
    };

    const error = normalizeStreamProviderError(data);

    expect(error).toMatchObject({
      message: 'Try again later',
      type: 'response.failed',
      code: 'rate_limit_exceeded',
      statusCode: undefined,
      isRetryable: false,
      data,
    });
  });

  it('preserves provider type and code as separate discriminators', () => {
    const data = {
      type: 'error',
      code: 'rate_limit_exceeded',
      message: 'Rate limit reached',
    };

    const error = normalizeStreamProviderError(data);

    expect(error).toMatchObject({
      message: 'Rate limit reached',
      type: 'error',
      code: 'rate_limit_exceeded',
      statusCode: undefined,
      isRetryable: false,
      data,
    });
  });

  it.each(['429', 429])(
    'preserves the provider type and code when code is HTTP status %p',
    code => {
      const data = {
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        code,
      };

      const error = normalizeStreamProviderError(data);

      expect(error).toMatchObject({
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        code,
        statusCode: 429,
        isRetryable: true,
        data,
      });
    },
  );

  it('uses explicit status metadata for non-retryable provider errors', () => {
    const error = normalizeStreamProviderError({
      message: 'A required provider dependency is unavailable',
      type: 'failed_dependency',
      statusCode: 424,
    });

    expect(error).toMatchObject({
      statusCode: 424,
      isRetryable: false,
    });
  });

  it('uses conservative metadata for unknown message-only errors', () => {
    const error = normalizeStreamProviderError({
      message: 'Provider-specific failure',
    });

    expect(error).toMatchObject({
      statusCode: undefined,
      isRetryable: false,
    });
  });

  it.each(['timeout_warning', 'not_found_in_cache'])(
    'does not infer metadata from arbitrary provider type "%s"',
    type => {
      const error = normalizeStreamProviderError({
        message: 'Provider-specific failure',
        type,
      });

      expect(error).toMatchObject({
        type,
        statusCode: undefined,
        isRetryable: false,
      });
    },
  );

  it('preserves existing Error instances', () => {
    const error = new Error('existing error');

    expect(normalizeStreamProviderError(error)).toBe(error);
  });

  it('preserves non-AI SDK cross-realm Error instances', () => {
    const error = {
      [Symbol.toStringTag]: 'Error',
      name: 'TypeError',
      message: 'cross-realm error',
      stack: 'TypeError: cross-realm error',
    };

    expect(error instanceof Error).toBe(false);
    expect(Object.prototype.toString.call(error)).toBe('[object Error]');
    expect(normalizeStreamProviderError(error)).toBe(error);
  });

  it('preserves cross-realm AI SDK errors', () => {
    const error = {
      [Symbol.for('vercel.ai.error')]: true,
      message: 'existing SDK error',
    };

    expect(AISDKError.isInstance(error)).toBe(true);
    expect(normalizeStreamProviderError(error)).toBe(error);
  });

  it.each([
    'plain string',
    { type: 'overloaded_error' },
    { message: 123 },
    null,
  ])('preserves non-normalizable values', error => {
    expect(normalizeStreamProviderError(error)).toBe(error);
  });
});
