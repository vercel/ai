import { AISDKError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { StreamProviderError } from '../error/stream-provider-error';
import { normalizeStreamProviderError } from './normalize-stream-provider-error';

describe('normalizeStreamProviderError', () => {
  it('normalizes a typed overloaded provider error', () => {
    const data = {
      message: 'Overloaded',
      type: 'overloaded_error',
    };

    const error = normalizeStreamProviderError({
      error: data,
      provider: 'anthropic.messages',
    });

    expect(StreamProviderError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Overloaded',
      type: 'overloaded_error',
      statusCode: 529,
      isRetryable: true,
      data,
    });
  });

  it.each([
    ['Internal server error', 500],
    ['Overloaded', 503],
  ])('normalizes a message-only "%s" provider error', (message, statusCode) => {
    const error = normalizeStreamProviderError({
      error: { message },
      provider: 'openai.chat',
    });

    expect(error).toMatchObject({
      message,
      type: undefined,
      statusCode,
      isRetryable: true,
    });
  });

  it('uses explicit status and retry metadata when available', () => {
    const error = normalizeStreamProviderError({
      error: {
        message: 'Request rejected',
        type: 'provider_rejection',
        status_code: 422,
        is_retryable: true,
      },
      provider: 'gateway',
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

    const error = normalizeStreamProviderError({
      error: data,
      provider: 'openai.responses',
    });

    expect(error).toMatchObject({
      message: 'Try again later',
      type: 'response.failed',
      statusCode: 429,
      isRetryable: true,
      data,
    });
  });

  it('classifies known non-retryable provider error types', () => {
    const error = normalizeStreamProviderError({
      error: {
        message: 'A required provider dependency is unavailable',
        type: 'failed_dependency',
      },
      provider: 'gateway',
    });

    expect(error).toMatchObject({
      statusCode: 424,
      isRetryable: false,
    });
  });

  it('uses conservative metadata for unknown message-only errors', () => {
    const error = normalizeStreamProviderError({
      error: { message: 'Provider-specific failure' },
      provider: 'custom',
    });

    expect(error).toMatchObject({
      statusCode: undefined,
      isRetryable: false,
    });
  });

  it('preserves existing Error instances', () => {
    const error = new Error('existing error');

    expect(
      normalizeStreamProviderError({
        error,
        provider: 'mock-provider',
      }),
    ).toBe(error);
  });

  it('preserves cross-realm AI SDK errors', () => {
    const error = {
      [Symbol.for('vercel.ai.error')]: true,
      message: 'existing SDK error',
    };

    expect(AISDKError.isInstance(error)).toBe(true);
    expect(
      normalizeStreamProviderError({
        error,
        provider: 'mock-provider',
      }),
    ).toBe(error);
  });

  it.each([
    'plain string',
    { type: 'overloaded_error' },
    { message: 123 },
    null,
  ])('preserves non-normalizable values', error => {
    expect(
      normalizeStreamProviderError({
        error,
        provider: 'mock-provider',
      }),
    ).toBe(error);
  });
});
