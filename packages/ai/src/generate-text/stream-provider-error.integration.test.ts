import { createGateway } from '@ai-sdk/gateway';
import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { StreamProviderError } from '../error';
import { streamText } from './stream-text';

describe('stream provider error integration', () => {
  const server = createTestServer({
    'https://api.test.com/language-model': {},
  });

  it('normalizes an actual Gateway mid-stream error once for callbacks and consumers', async () => {
    const data = {
      message: 'Upstream provider overloaded',
      type: 'provider_overloaded',
      statusCode: 503,
      isRetryable: true,
    };

    server.urls['https://api.test.com/language-model'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ type: 'stream-start', warnings: [] })}\n\n`,
        `data: ${JSON.stringify({ type: 'text-start', id: 'text-1' })}\n\n`,
        `data: ${JSON.stringify({
          type: 'text-delta',
          id: 'text-1',
          delta: 'Partial output',
        })}\n\n`,
        `data: ${JSON.stringify({ type: 'error', error: data })}\n\n`,
      ],
    };

    const gateway = createGateway({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
    });
    let onErrorValue: unknown;

    const result = streamText({
      model: gateway('test-model'),
      prompt: 'Test prompt',
      onError: ({ error }) => {
        onErrorValue = error;
      },
    });
    const parts = await convertAsyncIterableToArray(result.fullStream);
    const errorPart = parts.find(part => part.type === 'error');

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      expect.fail('Expected an error part');
    }

    expect(StreamProviderError.isInstance(errorPart.error)).toBe(true);
    expect(errorPart.error).toMatchObject({
      message: data.message,
      type: data.type,
      statusCode: data.statusCode,
      isRetryable: data.isRetryable,
      data,
    });
    expect(onErrorValue).toBe(errorPart.error);
  });
});
