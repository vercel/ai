import { describe, expect, it } from 'vitest';
import { StreamProviderError } from './stream-provider-error';

describe('StreamProviderError', () => {
  it('exposes provider metadata and preserves the raw payload', () => {
    const data = {
      message: 'Overloaded',
      type: 'overloaded_error',
      code: 'provider_overloaded',
    };

    const error = new StreamProviderError({
      message: data.message,
      type: data.type,
      code: data.code,
      statusCode: 529,
      data,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Overloaded');
    expect(error.type).toBe('overloaded_error');
    expect(error.code).toBe('provider_overloaded');
    expect(error.statusCode).toBe(529);
    expect(error.isRetryable).toBe(true);
    expect(error.data).toBe(data);
    expect(StreamProviderError.isInstance(error)).toBe(true);
  });

  it('uses an explicit retryability value', () => {
    const error = new StreamProviderError({
      message: 'Do not retry',
      statusCode: 503,
      isRetryable: false,
    });

    expect(error.isRetryable).toBe(false);
  });

  it('supports marker-based identification across package copies', () => {
    const error = {
      [Symbol.for('vercel.ai.error.AI_StreamProviderError')]: true,
    };

    expect(StreamProviderError.isInstance(error)).toBe(true);
  });
});
