import type { Experimental_VideoModelV3CallOptions } from '@ai-sdk/provider';
import { DownloadError } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { BlackForestLabsVideoModel } from './black-forest-labs-video-model';

const baseURL = 'http://localhost:8000/v1';
const origin = new URL(baseURL).origin;
const options: Experimental_VideoModelV3CallOptions = {
  prompt: 'A sea otter',
  n: 1,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  image: undefined,
  frameImages: undefined,
  inputReferences: undefined,
  generateAudio: undefined,
  providerOptions: {},
};
const ready = () =>
  Response.json({
    status: 'Ready',
    result: { sample: 'https://video.example.com/video.mp4' },
  });

function model(fetch: typeof globalThis.fetch, configuredBaseURL = baseURL) {
  return new BlackForestLabsVideoModel('flux-3-video', {
    provider: 'black-forest-labs.video',
    baseURL: configuredBaseURL,
    headers: () => ({ 'x-key': 'test-key', 'custom-provider-key': 'secret' }),
    fetch,
    pollIntervalMillis: 1,
  });
}

const submit = (pollingUrl = `${origin}/poll`) =>
  Response.json({ id: 'task', polling_url: pollingUrl });
const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

describe('video polling URL security', () => {
  it('blocks a redirect from the configured origin to another private origin', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(redirect('http://localhost:9000/poll'));

    await expect(model(fetch).doGenerate(options)).rejects.toThrow(
      DownloadError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].redirect).toBe('manual');
  });

  it('drops credentials on cross-origin polling redirects', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(redirect('https://poll.example.com/result'))
      .mockResolvedValueOnce(ready());

    await model(fetch).doGenerate(options);

    expect(new Headers(fetch.mock.calls[1][1].headers).get('x-key')).toBe(
      'test-key',
    );
    const headers = new Headers(fetch.mock.calls[2][1].headers);
    expect(headers.get('x-key')).toBeNull();
    expect(headers.get('custom-provider-key')).toBeNull();
    expect(fetch.mock.calls[2][1].redirect).toBe('manual');
  });

  it('preserves configured private polling origins', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(ready());
    const result = await model(fetch).doGenerate(options);
    expect(result.videos).toHaveLength(1);
    expect(fetch.mock.calls[1][1].redirect).toBe('manual');
  });

  it('preserves authenticated polling on official sibling clusters', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(submit('https://api.us1.bfl.ai/poll'))
      .mockResolvedValueOnce(ready());
    await model(fetch, 'https://api.bfl.ai/v1').doGenerate(options);
    expect(new Headers(fetch.mock.calls[1][1].headers).get('x-key')).toBe(
      'test-key',
    );
    expect(fetch.mock.calls[1][1].redirect).toBe('manual');
  });
});
