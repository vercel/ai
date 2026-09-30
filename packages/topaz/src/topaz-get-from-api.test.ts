import {
  createBinaryResponseHandler,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { topazFailedResponseHandler } from './topaz-error';
import { topazGetFromApi } from './topaz-get-from-api';

const baseURL = 'https://api.topazlabs.com';
const downloadURL = 'https://cdn.example.com/output.png';
const defaultOptions = {
  url: downloadURL,
  validateUrl: true,
  credentialedOrigin: baseURL,
  trustedOrigin: baseURL,
  headers: { 'X-API-Key': 'test-key', 'X-Custom-Secret': 'secret' },
  successfulResponseHandler: createBinaryResponseHandler(),
  failedResponseHandler: topazFailedResponseHandler,
};

const imageResponse = () => new Response(new Uint8Array([1, 2, 3]));

function recordRequests(responses: Response[]) {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const fetch: FetchFunction = async (url, init) => {
    requests.push({ url: url.toString(), headers: new Headers(init?.headers) });
    return responses.shift()!;
  };
  return { fetch, requests };
}

describe('Topaz image downloads', () => {
  it('withholds credentials from external downloads', async () => {
    const { fetch, requests } = recordRequests([imageResponse()]);
    const result = await topazGetFromApi({ ...defaultOptions, fetch });
    expect(result.value).toEqual(new Uint8Array([1, 2, 3]));
    expect(requests[0].headers.get('x-api-key')).toBeNull();
    expect(requests[0].headers.get('x-custom-secret')).toBeNull();
  });

  it('allows credentials on the configured origin and removes them on external redirects', async () => {
    const { fetch, requests } = recordRequests([
      new Response(null, { status: 302, headers: { location: downloadURL } }),
      imageResponse(),
    ]);
    await topazGetFromApi({
      ...defaultOptions,
      url: `${baseURL}/output.png`,
      fetch,
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].headers.get('x-api-key')).toBe('test-key');
    expect(requests[1].headers.get('x-api-key')).toBeNull();
    expect(requests[1].headers.get('x-custom-secret')).toBeNull();
  });

  it('blocks private download URLs before fetching', async () => {
    const fetch = vi.fn();
    await expect(
      topazGetFromApi({
        ...defaultOptions,
        url: 'http://127.0.0.1/output.png',
        fetch,
      }),
    ).rejects.toThrow(/not allowed/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks redirects to private addresses before following them', async () => {
    const { fetch, requests } = recordRequests([
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/secret' },
      }),
    ]);
    await expect(topazGetFromApi({ ...defaultOptions, fetch })).rejects.toThrow(
      /not allowed/,
    );
    expect(requests).toHaveLength(1);
  });

  it('allows downloads from a configured local endpoint', async () => {
    const { fetch, requests } = recordRequests([imageResponse()]);
    const localURL = 'http://localhost:8080';
    await topazGetFromApi({
      ...defaultOptions,
      url: `${localURL}/output.png`,
      trustedOrigin: localURL,
      credentialedOrigin: localURL,
      fetch,
    });
    expect(requests[0].headers.get('x-api-key')).toBe('test-key');
  });
});
