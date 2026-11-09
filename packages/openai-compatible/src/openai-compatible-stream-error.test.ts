import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { classifyOpenAICompatibleStreamError } from './openai-compatible-stream-error';

describe('classifyOpenAICompatibleStreamError', () => {
  it.each([
    [
      'server_is_overloaded code',
      { type: 'service_unavailable_error', code: 'server_is_overloaded' },
      503,
    ],
    ['overloaded_error type', { type: 'overloaded_error', code: null }, 503],
    ['service_unavailable type', { type: 'service_unavailable' }, 503],
    ['rate_limit_exceeded code', { code: 'rate_limit_exceeded' }, 429],
    ['timeout type', { type: 'timeout_error' }, 504],
    ['server_error type', { type: 'server_error' }, 500],
    ['api_error type', { type: 'api_error' }, 500],
  ])('marks %s as retryable', (_, fields, statusCode) => {
    const frame = { message: 'Please try again later.', ...fields };
    const result = classifyOpenAICompatibleStreamError(frame);

    expect(isProviderStreamError(result)).toBe(true);
    expect(result).toMatchObject({
      message: frame.message,
      statusCode,
      isRetryable: true,
      data: frame,
    });
  });

  it.each([
    [
      'insufficient_quota',
      { type: 'insufficient_quota', code: 'insufficient_quota' },
    ],
    [
      'quota that looks like a rate limit',
      { type: 'insufficient_quota', code: 'rate_limit_exceeded' },
    ],
    [
      'invalid_request_error',
      { type: 'invalid_request_error', code: 'context_length_exceeded' },
    ],
    ['authentication_error', { type: 'authentication_error' }],
    ['no type or code', {}],
  ])('returns %s frames unchanged', (_, fields) => {
    const frame = { message: 'nope', ...fields };

    expect(classifyOpenAICompatibleStreamError(frame)).toBe(frame);
  });
});
