import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

describe('stream error envelopes', () => {
  it.each([
    [503, 'UNAVAILABLE', 503, true],
    [null, 'UNAVAILABLE', 503, true],
    [null, 'RESOURCE_EXHAUSTED', 429, true],
    [null, 'DEADLINE_EXCEEDED', 504, true],
    [null, 'INTERNAL', 500, true],
    [null, 'ABORTED', 409, true],
    [null, 'CANCELLED', 499, false],
    [null, 'INVALID_ARGUMENT', 400, false],
    [null, 'PERMISSION_DENIED', 403, false],
    [null, 'NOT_FOUND', 404, false],
    [null, 'UNRECOGNIZED_STATUS', undefined, false],
    [400, 'UNAVAILABLE', 400, false],
  ])(
    'classifies code %s / status %s',
    async (code, status, statusCode, isRetryable) => {
      const error = { code, status, message: 'Provider stream failed.' };
      const provider = createGoogleGenerativeAI({
        apiKey: 'test-key',
        fetch: async () =>
          new Response(`data: ${JSON.stringify({ error })}\n\n`, {
            headers: { 'content-type': 'text/event-stream' },
          }),
      });
      const { stream } = await provider('gemini-2.5-flash').doStream({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      });
      const parts = [];
      for await (const part of stream) parts.push(part);
      const failure = parts.find(part => part.type === 'error');
      expect(APICallError.isInstance(failure?.error)).toBe(true);
      expect(failure?.error).toMatchObject({
        message: error.message,
        statusCode,
        isRetryable,
        data: error,
      });
      expect(parts.find(part => part.type === 'finish')).toMatchObject({
        finishReason: { unified: 'error', raw: undefined },
      });
    },
  );
});
