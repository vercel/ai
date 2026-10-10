import { createOpenAICompatible } from '../openai-compatible-provider';
import { describe, expect, it } from 'vitest';

type VideoResponse = {
  id: string;
  status: string;
  [key: string]: unknown;
};

describe('OpenAICompatibleVideos', () => {
  it('creates a job and retrieves its evolving status without losing provider fields', async () => {
    const responses: VideoResponse[] = [
      { id: 'video_123', status: 'queued', provider_field: 'kept' },
      { id: 'video_123', status: 'processing', progress: 40 },
      { id: 'video_123', status: 'completed', progress: 100 },
    ];
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ url: input.toString(), init });
      const body = responses.shift();
      if (body == null) {
        throw new Error('Unexpected request');
      }
      return Response.json(body);
    };
    const provider = createOpenAICompatible({
      name: 'test-provider',
      baseURL: 'https://api.example.com/v1/',
      apiKey: 'test-key',
      headers: { 'x-provider': 'test' },
      queryParams: { account: 'test-account' },
      fetch,
    });
    const created = await provider.videos.create({
      model: 'video-model',
      prompt: 'A city at sunset',
      input_reference: new Blob(['reference'], { type: 'image/png' }),
    });
    const processing = await provider.videos.retrieve(created.id);
    const completed = await provider.videos.retrieve(created.id);

    expect(created).toMatchObject({
      id: 'video_123',
      status: 'queued',
      provider_field: 'kept',
    });
    expect(processing.status).toBe('processing');
    expect(completed).toMatchObject({
      id: 'video_123',
      status: 'completed',
      progress: 100,
    });

    expect(requests.map(({ url, init }) => [init?.method, url])).toEqual([
      ['POST', 'https://api.example.com/v1/videos?account=test-account'],
      [
        'GET',
        'https://api.example.com/v1/videos/video_123?account=test-account',
      ],
      [
        'GET',
        'https://api.example.com/v1/videos/video_123?account=test-account',
      ],
    ]);

    const createRequest = requests[0];
    const formData = createRequest?.init?.body as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('model')).toBe('video-model');
    expect(formData.get('prompt')).toBe('A city at sunset');
    expect(formData.get('input_reference')).toMatchObject({
      type: 'image/png',
    });
    expect(new Headers(createRequest?.init?.headers).get('authorization')).toBe(
      'Bearer test-key',
    );
    expect(new Headers(createRequest?.init?.headers).get('x-provider')).toBe(
      'test',
    );
    expect(new Headers(createRequest?.init?.headers).has('content-type')).toBe(
      false,
    );
    expect(new Headers(requests[1]?.init?.headers).get('authorization')).toBe(
      'Bearer test-key',
    );
  });

  it('preserves terminal provider errors in a failed job response', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      Response.json({
        id: 'video_failed',
        status: 'failed',
        error: {
          code: 'generation_failed',
          message: 'Provider rejected input',
        },
      });
    const provider = createOpenAICompatible({
      name: 'test-provider',
      baseURL: 'https://api.example.com/v1',
      fetch,
    });
    await expect(
      provider.videos.retrieve('video_failed'),
    ).resolves.toMatchObject({
      id: 'video_failed',
      status: 'failed',
      error: {
        code: 'generation_failed',
        message: 'Provider rejected input',
      },
    });
  });
});
