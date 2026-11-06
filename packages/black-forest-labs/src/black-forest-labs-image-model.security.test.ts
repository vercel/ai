import { DownloadError, type FetchFunction } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { BlackForestLabsImageModel } from './black-forest-labs-image-model';

const baseURL = 'http://localhost:8000/v1';
const origin = new URL(baseURL).origin;
const image = 'https://images.example.com/image.png';
const options = {
  prompt: 'A sea otter',
  n: 1,
  size: undefined,
  aspectRatio: undefined,
  seed: undefined,
  files: undefined,
  mask: undefined,
  providerOptions: {},
};

function model(fetch: FetchFunction) {
  return new BlackForestLabsImageModel('flux-2-pro', {
    provider: 'black-forest-labs.image',
    baseURL,
    headers: () => ({
      'x-key': 'test-key',
      authorization: 'Bearer test-token',
      'custom-provider-key': 'custom-secret',
    }),
    fetch,
  });
}

function submit(pollingUrl = `${origin}/poll`) {
  return Response.json({ id: 'task', polling_url: pollingUrl });
}

function ready(sample = image) {
  return Response.json({ status: 'Ready', result: { sample } });
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

describe('response URL security', () => {
  it.each([
    'http://127.0.0.1:9000/image.png',
    'http://[::1]:9000/image.png',
    'http://10.0.0.1/image.png',
    'http://169.254.169.254/image.png',
  ])('rejects an untrusted private image URL: %s', async url => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(ready(url));

    await expect(model(fetch).doGenerate(options)).rejects.toThrow(
      DownloadError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    'http://127.0.0.1:9000/poll',
    'http://[::1]:9000/poll',
    'http://10.0.0.1/poll',
    'http://169.254.169.254/poll',
  ])('rejects an untrusted private polling URL: %s', async url => {
    const fetch = vi.fn().mockResolvedValueOnce(submit(url));

    await expect(model(fetch).doGenerate(options)).rejects.toThrow(
      DownloadError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['poll', 'image'])(
    'validates redirects from a trusted %s URL',
    async stage => {
      const fetch = vi.fn().mockResolvedValueOnce(submit());
      if (stage === 'image') {
        fetch.mockResolvedValueOnce(ready(`${origin}/image.png`));
      }
      fetch.mockResolvedValueOnce(redirect('http://localhost:9000/blocked'));

      await expect(model(fetch).doGenerate(options)).rejects.toThrow(
        DownloadError,
      );
      expect(fetch).toHaveBeenCalledTimes(stage === 'poll' ? 2 : 3);
      expect(fetch.mock.calls.at(-1)?.[1]?.redirect).toBe('manual');
    },
  );

  it('allows polling and downloads on the configured private origin', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(ready(`${origin}/image.png`))
      .mockResolvedValueOnce(new Response('image-bytes'));

    const result = await model(fetch).doGenerate(options);

    expect(result.images).toEqual([new TextEncoder().encode('image-bytes')]);
    for (const [, init] of fetch.mock.calls.slice(1)) {
      expect(new Headers(init.headers).get('x-key')).toBe('test-key');
      expect(init.redirect).toBe('manual');
    }
  });

  it('withholds credentials from foreign polling and image origins', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit('https://poll.example.com/result'))
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(new Response('image-bytes'));

    await model(fetch).doGenerate(options);

    for (const [, init] of fetch.mock.calls.slice(1)) {
      const headers = new Headers(init.headers);
      expect(headers.get('x-key')).toBeNull();
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('custom-provider-key')).toBeNull();
      expect(init.redirect).toBe('manual');
    }
  });

  it.each(['poll', 'image'])(
    'drops credentials on cross-origin %s redirects',
    async stage => {
      const fetch = vi.fn().mockResolvedValueOnce(submit());
      if (stage === 'image') {
        fetch.mockResolvedValueOnce(ready(`${origin}/image.png`));
      }
      fetch.mockResolvedValueOnce(
        redirect(`https://${stage}.example.com/result`),
      );
      if (stage === 'poll') {
        fetch.mockResolvedValueOnce(ready());
      }
      fetch.mockResolvedValueOnce(new Response('image-bytes'));

      await model(fetch).doGenerate(options);

      const redirectCall = fetch.mock.calls[stage === 'poll' ? 2 : 3];
      const headers = new Headers(redirectCall[1].headers);
      expect(headers.get('x-key')).toBeNull();
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('custom-provider-key')).toBeNull();
      expect(redirectCall[1].redirect).toBe('manual');
    },
  );
});
