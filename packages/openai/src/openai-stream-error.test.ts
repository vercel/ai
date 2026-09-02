import { describe, expect, it } from 'vitest';
import { createOpenAIProviderStreamError } from './openai-stream-error';

describe('createOpenAIProviderStreamError', () => {
  it('flattens a nested error event', () => {
    const data = {
      type: 'error',
      sequence_number: 114,
      error: {
        type: 'invalid_request_error',
        code: 'invalid_prompt',
        message: 'Invalid prompt: your prompt was flagged.',
        param: null,
      },
    };

    expect(createOpenAIProviderStreamError(data)).toEqual({
      message: 'Invalid prompt: your prompt was flagged.',
      type: 'invalid_request_error',
      code: 'invalid_prompt',
      statusCode: 400,
      isRetryable: false,
      data,
    });
  });

  it('flattens a top-level error event', () => {
    const data = {
      type: 'error',
      code: 'rate_limit_exceeded',
      message: 'Rate limit reached',
      param: null,
    };

    expect(createOpenAIProviderStreamError(data)).toEqual({
      message: 'Rate limit reached',
      type: 'error',
      code: 'rate_limit_exceeded',
      statusCode: 429,
      isRetryable: true,
      data,
    });
  });

  it('classifies insufficient quota as non-retryable', () => {
    const data = {
      type: 'error',
      code: 'insufficient_quota',
      message: 'You exceeded your current quota.',
      param: null,
    };

    expect(createOpenAIProviderStreamError(data)).toMatchObject({
      statusCode: 429,
      isRetryable: false,
    });
  });

  it('flattens a response.failed event', () => {
    const data = {
      type: 'response.failed',
      sequence_number: 3,
      response: {
        error: { code: 'server_error', message: 'Response failed' },
        incomplete_details: null,
        service_tier: null,
      },
    };

    expect(createOpenAIProviderStreamError(data)).toEqual({
      message: 'Response failed',
      type: 'response.failed',
      code: 'server_error',
      statusCode: 500,
      isRetryable: true,
      data,
    });
  });

  it('returns undefined for frames without a message', () => {
    expect(
      createOpenAIProviderStreamError({ type: 'error', error: {} }),
    ).toBeUndefined();
    expect(createOpenAIProviderStreamError('boom')).toBeUndefined();
  });
});
