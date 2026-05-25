import { describe, expect, it, vi } from 'vitest';
import { createGradium } from './index';

function fakeFetch(response: Response) {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe('gradiumFailedResponseHandler', () => {
  it('surfaces a JSON-object error message', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        new Response(
          JSON.stringify({
            error: { message: 'invalid voice id', code: 'bad_voice' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      ),
    });

    await expect(gradium.speech().doGenerate({ text: 'boom' })).rejects.toThrow(
      /invalid voice id/,
    );
  });

  it('surfaces a JSON string error payload', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        new Response(JSON.stringify({ error: 'forbidden voice' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    });

    await expect(gradium.speech().doGenerate({ text: 'boom' })).rejects.toThrow(
      /forbidden voice/,
    );
  });

  it('surfaces a plain-text error body (Gradium auth case)', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        new Response(
          'error from server Some(1008): API key is revoked or expired\n' +
            'Need more support? Feel free to reach out by email at support@gradium.ai',
          {
            status: 500,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          },
        ),
      ),
    });

    await expect(gradium.speech().doGenerate({ text: 'boom' })).rejects.toThrow(
      /API key is revoked or expired/,
    );
  });

  it('marks the Gradium 1008 auth case as non-retryable to avoid wasted retries', async () => {
    let calls = 0;
    const fetchSpy = vi.fn(async () => {
      calls += 1;
      return new Response(
        'error from server Some(1008): API key is revoked or expired',
        { status: 500, headers: { 'content-type': 'text/plain' } },
      );
    }) as unknown as typeof fetch;

    const gradium = createGradium({ apiKey: 'test-key', fetch: fetchSpy });

    await expect(gradium.speech().doGenerate({ text: 'boom' })).rejects.toThrow(
      /API key is revoked/,
    );

    expect(calls).toBe(1);
  });
});
