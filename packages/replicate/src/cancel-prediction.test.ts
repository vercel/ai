import { describe, expect, it, vi } from 'vitest';
import { cancelReplicatePrediction } from './cancel-prediction';

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

describe('cancelReplicatePrediction', () => {
  it('posts to the prediction cancel endpoint with the configured headers', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ status: 'canceled' }),
    );

    await cancelReplicatePrediction({
      baseURL: 'https://api.replicate.com/v1',
      predictionId: 's7x1e3dcmhrmc0cm8rbatcneec',
      headers: async () => ({ Authorization: 'Bearer test-api-token' }),
      fetch,
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec/cancel',
    );
    expect(init?.method).toBe('POST');
    expect(
      headerValue(init?.headers as Record<string, string>, 'authorization'),
    ).toBe('Bearer test-api-token');
    // no idempotency key and no abort signal on the cancel request
    expect(
      headerValue(init?.headers as Record<string, string>, 'idempotency-key'),
    ).toBeUndefined();
    expect(init?.signal).toBeUndefined();
  });

  it('encodes the prediction id in the URL path', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ status: 'canceled' }),
    );

    await cancelReplicatePrediction({
      baseURL: 'https://api.replicate.com/v1',
      predictionId: 'owner/prediction id',
      headers: {},
      fetch,
    });

    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.replicate.com/v1/predictions/owner%2Fprediction%20id/cancel',
    );
  });

  it.each([
    {
      name: 'the network request fails',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    },
    {
      name: 'the API responds with an error status',
      fetch: async () =>
        Response.json({ detail: 'Something went wrong' }, { status: 500 }),
    },
  ])('swallows the error when $name', async ({ fetch }) => {
    await expect(
      cancelReplicatePrediction({
        baseURL: 'https://api.replicate.com/v1',
        predictionId: 's7x1e3dcmhrmc0cm8rbatcneec',
        headers: { Authorization: 'Bearer test-api-token' },
        fetch,
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows errors while resolving the headers', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ status: 'canceled' }),
    );

    await expect(
      cancelReplicatePrediction({
        baseURL: 'https://api.replicate.com/v1',
        predictionId: 's7x1e3dcmhrmc0cm8rbatcneec',
        headers: async () => {
          throw new Error('token unavailable');
        },
        fetch,
      }),
    ).resolves.toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
  });
});
