import { describe, expect, it } from 'vitest';
import { createUIApiCallError } from './create-ui-api-call-error';

describe('createUIApiCallError', () => {
  it('should include an empty response header record when no headers are present', async () => {
    const error = await createUIApiCallError({
      response: new Response(null, { status: 429 }),
      url: '/api/chat',
      fallbackMessage: 'Request failed.',
    });

    expect(error.responseHeaders).toEqual({});
  });
});
